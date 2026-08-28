"""Conversation and chat message API routes."""

import asyncio
import hashlib
import io
import json
import logging
import time
from urllib.parse import urlparse
from uuid import UUID

from fastapi import (
    APIRouter,
    Body,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel

from app.agents.llm_context import clear_language_context, clear_llm_override, set_language_context, set_llm_override
from app.api.deps import ConversationSvc, DBSession, get_current_user, get_current_user_for_image
from app.core.config import settings
from app.db.session import get_db_context
from app.db.models.user import User
from app.pipelines.tabular_upload import normalize_tabular_upload_to_csv
from app.pipelines.url_ingest import fetch_public_json_from_url
from app.schemas.conversation import (
    ChatMessageCreate,
    ChatMessageRead,
    ChatMessageUpdate,
    ConversationCreate,
    ConversationListRead,
    ConversationRead,
    ConversationUpdate,
    ConversationWithMessagesRead,
)

router = APIRouter(prefix="/conversations", tags=["conversations"])
logger = logging.getLogger(__name__)
_url_ingest_pipeline_running: set[UUID] = set()


@router.get("", response_model=list[ConversationListRead])
async def list_conversations(
    conversation_service: ConversationSvc,
    db: DBSession,
    current_user: User = Depends(get_current_user),
):
    """List current user's conversations with viz_count and csv_filename."""
    from app.repositories import chat_message_repo, visualization_repo

    conversations = await conversation_service.get_multi(current_user)
    if not conversations:
        return []

    conv_ids = [c.id for c in conversations]
    viz_counts = await visualization_repo.count_done_by_conversation_ids(db, conv_ids)
    csv_filenames = await chat_message_repo.get_first_csv_filename_by_conversation_ids(db, conv_ids)

    return [
        ConversationListRead(
            id=c.id,
            user_id=c.user_id,
            title=c.title,
            created_at=c.created_at,
            updated_at=c.updated_at,
            viz_count=viz_counts.get(c.id, 0),
            csv_filename=csv_filenames.get(c.id),
        )
        for c in conversations
    ]


@router.post("", response_model=ConversationRead, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    conv_in: ConversationCreate,
    conversation_service: ConversationSvc,
    current_user: User = Depends(get_current_user),
):
    """Create a new conversation."""
    return await conversation_service.create(current_user, conv_in)


@router.get("/{conversation_id}/visualizations")
async def list_visualizations(
    conversation_id: UUID,
    db: DBSession,
    current_user: User = Depends(get_current_user),
):
    """List visualization metadata for a conversation (no image bytes)."""
    from app.repositories import conversation_repo, visualization_repo

    if not await conversation_repo.belongs_to_user(db, conversation_id, current_user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    rows = await visualization_repo.list_by_conversation(db, conversation_id)
    base = settings.API_V1_STR.rstrip("/")
    return [
        {
            "task_id": r.task_id,
            "chart_type": r.chart_type,
            "features": r.features,
            "status": r.status,
            "image_url": f"{base}/conversations/{conversation_id}/visualizations/{r.task_id}"
            if r.status == "done"
            else None,
            "metadata": r.metadata_,
            "annotation": r.annotation,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "is_chat_viz": bool((r.metadata_ or {}).get("is_chat_viz")),
        }
        for r in rows
    ]


@router.get(
    "/{conversation_id}/visualizations/{task_id}",
    response_class=Response,
    responses={
        200: {"content": {"image/png": {}, "image/webp": {}}},
        304: {},
        404: {"description": "Not found"},
    },
)
async def get_visualization_image(
    conversation_id: UUID,
    task_id: str,
    db: DBSession,
    request: Request,
    thumb: bool = Query(False, description="Return a thumbnail-sized image (max 600 px wide)"),
    current_user: User = Depends(get_current_user_for_image),
) -> Response:
    """Get a visualization image by conversation and task ID.

    Supports:
    - WebP via ``Accept: image/webp`` request header (typically 30-50 % smaller than PNG).
    - Thumbnail via ``?thumb=1`` (max 600 px wide, ideal for grid previews).
    - ``Cache-Control: private, max-age=86400, immutable`` so the browser caches images
      for a full day, eliminating re-fetches on subsequent page visits.
    - ``ETag`` + ``304 Not Modified`` for conditional-request support.
    """
    from app.repositories import conversation_repo, visualization_repo

    if not await conversation_repo.belongs_to_user(db, conversation_id, current_user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    image_data = await visualization_repo.get_image(
        db,
        conversation_id=conversation_id,
        task_id=task_id,
    )
    if not image_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    accept = request.headers.get("accept", "")
    use_webp = "image/webp" in accept

    # Stable ETag keyed on raw-bytes hash + size variant + format.
    raw_hash = hashlib.md5(image_data, usedforsecurity=False).hexdigest()
    etag = f'"{raw_hash}{"t" if thumb else ""}{"w" if use_webp else ""}"'

    cache_headers = {
        "Cache-Control": "private, max-age=86400, immutable",
        "ETag": etag,
        "Vary": "Accept",
    }

    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=cache_headers)

    processed: bytes = image_data
    media_type = "image/png"
    try:
        from PIL import Image  # type: ignore[import-untyped]

        img = Image.open(io.BytesIO(image_data))
        if thumb and img.width > 600:
            ratio = 600 / img.width
            img = img.resize((600, int(img.height * ratio)), Image.LANCZOS)
        out = io.BytesIO()
        if use_webp:
            img.save(out, format="WEBP", quality=85, method=4)
            media_type = "image/webp"
        else:
            img.save(out, format="PNG", optimize=True)
        processed = out.getvalue()
    except Exception:
        pass  # fall back to original PNG bytes

    return Response(content=processed, media_type=media_type, headers=cache_headers)


class GenerateMoreBody(BaseModel):
    """Optional LLM overrides for generate-more-visualizations."""

    openrouter_api_key: str | None = None
    ai_model: str | None = None


class MessageWithUrlBody(BaseModel):
    """Request body for URL-based tabular ingestion."""

    content: str = "Analyze this data"
    role: str = "user"
    url: str


async def _run_url_ingest_pipeline_fallback(conversation_id: UUID, csv_text: str) -> None:
    """Best-effort pipeline fallback when WS-triggered analysis is missed.

    URL import currently persists message content via REST, while visualization
    pipeline is typically triggered by a subsequent WebSocket message.
    If that trigger is lost due to client timing, this fallback runs analysis
    server-side so conversation overview does not stay in perpetual "in progress".
    """
    if conversation_id in _url_ingest_pipeline_running:
        return
    _url_ingest_pipeline_running.add(conversation_id)

    try:
        # Give WS path a chance first; only fallback if context is still missing.
        await asyncio.sleep(settings.URL_INGEST_FALLBACK_DELAY_SECONDS)

        from app.pipelines.csv_preprocessor import preprocess_csv, preprocess_csv_with_data
        from app.pipelines.feature_engineer import run_feature_engineering
        from app.pipelines.visualization import run_visualization
        from app.repositories import report_repo, visualization_repo

        async with get_db_context() as db:
            existing_ctx = await report_repo.get_csv_context(db, conversation_id)
            if existing_ctx and existing_ctx.csv_summary:
                logger.info(
                    "Skip URL fallback pipeline: csv context already exists conversation_id=%s",
                    conversation_id,
                )
                return
            existing_viz = await visualization_repo.list_by_conversation(db, conversation_id)
            if any(v.status == "done" for v in existing_viz):
                logger.info(
                    "Skip URL fallback pipeline: visualizations already exist conversation_id=%s",
                    conversation_id,
                )
                return

        original_summary, preprocessed_csv = await asyncio.to_thread(
            preprocess_csv_with_data, csv_text
        )
        if original_summary.error:
            logger.warning(
                "URL fallback preprocessing failed conversation_id=%s error=%s",
                conversation_id,
                original_summary.error,
            )
            return

        async with get_db_context() as db:
            await report_repo.upsert_csv_context(
                db,
                conversation_id=conversation_id,
                csv_summary=original_summary.to_dict(),
                original_csv=csv_text,
                original_csv_summary=original_summary.to_dict(),
            )

        enhanced_csv = csv_text
        enhanced_summary = original_summary
        if preprocessed_csv:
            try:
                enhanced_csv = await run_feature_engineering(original_summary, preprocessed_csv)
                enhanced_summary = await asyncio.to_thread(preprocess_csv, enhanced_csv)
            except Exception as exc:
                logger.warning(
                    "URL fallback feature engineering failed, using original CSV conversation_id=%s error=%s",
                    conversation_id,
                    exc,
                )
                enhanced_csv = csv_text
                enhanced_summary = original_summary

        async with get_db_context() as db:
            await report_repo.upsert_csv_context(
                db,
                conversation_id=conversation_id,
                csv_summary=enhanced_summary.to_dict(),
                enhanced_csv=enhanced_csv,
                original_csv=csv_text,
                original_csv_summary=original_summary.to_dict(),
            )

        await run_visualization(
            enhanced_csv=enhanced_csv,
            csv_summary=enhanced_summary,
            conversation_id=conversation_id,
        )
        logger.info(
            "URL fallback pipeline completed conversation_id=%s",
            conversation_id,
        )
    except Exception:
        logger.exception(
            "URL fallback pipeline failed conversation_id=%s",
            conversation_id,
        )
    finally:
        _url_ingest_pipeline_running.discard(conversation_id)


@router.post("/{conversation_id}/generate-more-visualizations")
async def generate_more_visualizations(
    conversation_id: UUID,
    db: DBSession,
    current_user: User = Depends(get_current_user),
    body: GenerateMoreBody | None = Body(None),
):
    """Generate 10 more visualizations for a conversation.

    Uses the same enhanced CSV and history as the initial pipeline.
    Streams progress via Server-Sent Events (viz_start, viz_task_complete, viz_complete).
    Requires: conversation ownership and existing CSV context with enhanced_csv.
    """
    from app.core.message_bus import VizResult
    from app.pipelines.csv_preprocessor import CsvSummary
    from app.pipelines.visualization import run_visualization
    from app.repositories import conversation_repo, report_repo, visualization_repo

    if not await conversation_repo.belongs_to_user(db, conversation_id, current_user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    csv_ctx = await report_repo.get_csv_context(db, conversation_id)
    if not csv_ctx:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No CSV context. Run the visualization pipeline first.",
        )
    if not csv_ctx.enhanced_csv:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No enhanced CSV stored. Re-upload and run visualization first.",
        )

    existing = await visualization_repo.list_by_conversation(db, conversation_id)
    initial_exclude = [(r.chart_type, r.features) for r in existing]

    target_charts = settings.VIZ_TARGET_CHARTS

    api_key = (body.openrouter_api_key or "").strip() or None if body else None
    model = (body.ai_model or "").strip() or None if body else None
    set_llm_override(api_key=api_key, model=model)

    async def event_stream():
        import asyncio

        queue: asyncio.Queue[tuple[str, dict]] = asyncio.Queue()

        def on_turn_start(turn: int, total: int) -> None:
            asyncio.create_task(
                queue.put(
                    (
                        "viz_turn_start",
                        {
                            "turn": turn,
                            "total_turns": total,
                            "message": f"Starting turn {turn}/{total}",
                        },
                    )
                )
            )

        def on_viz_event_cb(result: VizResult) -> None:
            asyncio.create_task(
                queue.put(
                    (
                        "viz_task_complete",
                        {
                            "task_id": result.task_id,
                            "chart_type": result.chart_type,
                            "features": result.features,
                            "status": result.status,
                            "image_path": result.image_path,
                            "error": result.error,
                            "metadata": result.metadata,
                            "annotation": result.metadata.get("annotation")
                            if result.metadata
                            else None,
                        },
                    )
                )
            )

        async def run_viz():
            try:
                await queue.put(
                    (
                        "viz_start",
                        {
                            "message": "Generating more visualizations",
                            "target_charts": target_charts,
                            "turns": 1,
                            "total_charts": target_charts,
                        },
                    )
                )
                results = await run_visualization(
                    enhanced_csv=csv_ctx.enhanced_csv,
                    csv_summary=CsvSummary.from_dict(csv_ctx.csv_summary),
                    conversation_id=conversation_id,
                    on_event=on_viz_event_cb,
                    on_turn_start=on_turn_start,
                    num_turns=1,
                    target_charts=target_charts,
                    initial_exclude=initial_exclude,
                )
                done = sum(1 for r in results if r.status == "done")
                skipped = sum(1 for r in results if r.status == "skipped")
                err = sum(1 for r in results if r.status == "error")
                await queue.put(
                    (
                        "viz_complete",
                        {
                            "message": f"Generated {done} more charts.",
                            "total": len(results),
                            "turns": 1,
                            "done": done,
                            "skipped": skipped,
                            "error": err,
                            "results": [
                                {
                                    "task_id": r.task_id,
                                    "chart_type": r.chart_type,
                                    "features": r.features,
                                    "status": r.status,
                                    "image_path": r.image_path,
                                    "metadata": r.metadata,
                                }
                                for r in results
                            ],
                        },
                    )
                )
            except Exception as e:
                await queue.put(("viz_error", {"message": str(e)}))
            finally:
                clear_llm_override()
                await queue.put(("_done", {}))

        task = asyncio.create_task(run_viz())

        while True:
            evt_type, evt_data = await queue.get()
            if evt_type == "_done":
                break
            yield f"event: {evt_type}\ndata: {json.dumps(evt_data, default=str)}\n\n"

        await task

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/{conversation_id}/csv-context")
async def get_csv_context(
    conversation_id: UUID,
    db: DBSession,
    current_user: User = Depends(get_current_user),
):
    """Get CSV context (summary) for a conversation.

    Returns the stored csv_summary from the visualization pipeline.
    Used for displaying upload/cleaning sample data in the UI.
    """
    from app.repositories import conversation_repo, report_repo

    if not await conversation_repo.belongs_to_user(db, conversation_id, current_user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    record = await report_repo.get_csv_context(db, conversation_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CSV context not found")

    # original_csv_summary: for Data Upload (original CSV); csv_summary: for Data Cleaning (enhanced)
    return {
        "csv_summary": record.csv_summary,
        "original_csv_summary": record.original_csv_summary,
    }


@router.get("/{conversation_id}", response_model=ConversationWithMessagesRead)
async def get_conversation(
    conversation_id: UUID,
    conversation_service: ConversationSvc,
    current_user: User = Depends(get_current_user),
):
    """Get a conversation with its messages."""
    return await conversation_service.get_by_id_with_messages(conversation_id, current_user)


@router.patch("/{conversation_id}", response_model=ConversationRead)
async def update_conversation(
    conversation_id: UUID,
    conv_in: ConversationUpdate,
    conversation_service: ConversationSvc,
    current_user: User = Depends(get_current_user),
):
    """Update a conversation (e.g. rename)."""
    return await conversation_service.update(conversation_id, current_user, conv_in)


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: UUID,
    conversation_service: ConversationSvc,
    current_user: User = Depends(get_current_user),
):
    """Delete a conversation and its messages."""
    await conversation_service.delete(conversation_id, current_user)


@router.post(
    "/{conversation_id}/messages",
    response_model=ChatMessageRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_message(
    conversation_id: UUID,
    msg_in: ChatMessageCreate,
    conversation_service: ConversationSvc,
    current_user: User = Depends(get_current_user),
):
    """Add a message to a conversation."""
    return await conversation_service.add_message(conversation_id, current_user, msg_in)


TABULAR_CONTENT_TYPES = {
    "text/csv",
    "text/plain",
    "application/csv",
    "application/json",
    "text/json",
}


@router.post(
    "/{conversation_id}/messages/with-csv",
    response_model=ChatMessageRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_message_with_csv(
    conversation_id: UUID,
    conversation_service: ConversationSvc,
    content: str = Form(..., description="Message content"),
    role: str = Form("user", description="Message role"),
    file: UploadFile = File(..., description="CSV or JSON file to attach"),
    current_user: User = Depends(get_current_user),
):
    """Add a user message with an attached CSV or JSON file.

    The content is normalized to CSV and passed to the existing AI pipeline.
    """
    max_bytes = int(settings.CSV_UPLOAD_MAX_SIZE_MB * 1024 * 1024)
    filename = file.filename or ""
    extension = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""

    if extension not in {"csv", "json"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only CSV and JSON files are allowed. File must have .csv or .json extension.",
        )

    content_type = file.content_type or ""
    if content_type and content_type not in TABULAR_CONTENT_TYPES:
        if not any(content_type.startswith(t) for t in ("text/", "application/")):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid file type: {content_type}. Expected CSV or JSON.",
            )

    file_content = await file.read()
    if len(file_content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum size of {settings.CSV_UPLOAD_MAX_SIZE_MB} MB.",
        )

    try:
        file_text = file_content.decode("utf-8", errors="replace")
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not decode file as UTF-8 text.",
        )

    try:
        csv_text = normalize_tabular_upload_to_csv(filename, file_text)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    return await conversation_service.add_message_with_csv(
        conversation_id, current_user, content, role, filename, csv_text
    )


@router.post(
    "/{conversation_id}/messages/with-url",
    response_model=ChatMessageRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_message_with_url(
    conversation_id: UUID,
    body: MessageWithUrlBody,
    conversation_service: ConversationSvc,
    current_user: User = Depends(get_current_user),
):
    """Add a user message by fetching JSON from a public URL and converting to CSV."""
    max_bytes = int(settings.URL_FETCH_MAX_SIZE_MB * 1024 * 1024)
    start_ts = time.perf_counter()
    parsed = urlparse(body.url)
    host = (parsed.hostname or "").lower()

    try:
        filename, json_text = await fetch_public_json_from_url(
            body.url,
            timeout_seconds=settings.URL_FETCH_TIMEOUT_SECONDS,
            max_size_bytes=max_bytes,
            max_redirects=settings.URL_FETCH_MAX_REDIRECTS,
        )
        csv_text = normalize_tabular_upload_to_csv(filename, json_text)
    except ValueError as exc:
        elapsed_ms = int((time.perf_counter() - start_ts) * 1000)
        logger.warning(
            "URL data ingest failed host=%s elapsed_ms=%d error=%s",
            host,
            elapsed_ms,
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    elapsed_ms = int((time.perf_counter() - start_ts) * 1000)
    logger.info(
        "URL data ingest succeeded host=%s elapsed_ms=%d bytes=%d",
        host,
        elapsed_ms,
        len(json_text.encode("utf-8")),
    )

    stored_message = await conversation_service.add_message_with_csv(
        conversation_id=conversation_id,
        user=current_user,
        content=body.content,
        role=body.role,
        csv_filename=filename,
        csv_content=csv_text,
    )

    # WS-triggered analysis can be missed due to client timing.
    # Schedule a server-side fallback so successful URL imports still complete.
    asyncio.create_task(_run_url_ingest_pipeline_fallback(conversation_id, csv_text))
    return stored_message


@router.patch(
    "/{conversation_id}/messages/{message_id}",
    response_model=ChatMessageRead,
)
async def update_message(
    conversation_id: UUID,
    message_id: UUID,
    msg_in: ChatMessageUpdate,
    conversation_service: ConversationSvc,
    current_user: User = Depends(get_current_user),
):
    """Update a message (e.g. during streaming)."""
    return await conversation_service.update_message(
        conversation_id, message_id, current_user, msg_in
    )


@router.post("/{conversation_id}/report")
async def generate_report(
    conversation_id: UUID,
    db: DBSession,
    current_user: User = Depends(get_current_user),
    language: str = Query(default="en"),
):
    """Trigger report generation for a conversation.

    Requires: conversation ownership, CSV context (from completed viz pipeline),
    and at least one done visualization with annotation.
    """
    from app.agents.report_agent import VizProperty
    from app.agents.report_agent import generate_report as run_report_agent
    from app.pipelines.csv_preprocessor import CsvSummary
    from app.repositories import conversation_repo, report_repo, visualization_repo

    if not await conversation_repo.belongs_to_user(db, conversation_id, current_user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    csv_ctx = await report_repo.get_csv_context(db, conversation_id)
    if not csv_ctx:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No CSV context. Run the visualization pipeline first.",
        )

    viz_rows = await visualization_repo.list_by_conversation(db, conversation_id)
    done_with_annotation = [r for r in viz_rows if r.status == "done" and r.annotation]
    if not done_with_annotation:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No visualizations with annotations. Complete visualization pipeline first.",
        )

    csv_summary = CsvSummary.from_dict(csv_ctx.csv_summary)
    viz_props = [VizProperty.from_visualization_result(r) for r in done_with_annotation]

    set_language_context(language)
    try:
        report = await run_report_agent(csv_summary, viz_props)
    finally:
        clear_language_context()

    await report_repo.upsert_report(
        db,
        conversation_id=conversation_id,
        dataset_overview=report.dataset_overview,
        key_findings=[f.model_dump() for f in report.key_findings],
        relationship_analysis=[r.model_dump() for r in report.relationship_analysis],
        suggestions=report.suggestions,
    )

    return {
        "dataset_overview": report.dataset_overview,
        "key_findings": [f.model_dump() for f in report.key_findings],
        "relationship_analysis": [r.model_dump() for r in report.relationship_analysis],
        "suggestions": report.suggestions,
    }


@router.get("/{conversation_id}/report")
async def get_report(
    conversation_id: UUID,
    db: DBSession,
    current_user: User = Depends(get_current_user),
):
    """Get the persisted report for a conversation."""
    from app.repositories import conversation_repo, report_repo

    if not await conversation_repo.belongs_to_user(db, conversation_id, current_user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    record = await report_repo.get_report(db, conversation_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    return {
        "dataset_overview": record.dataset_overview,
        "key_findings": record.key_findings,
        "relationship_analysis": record.relationship_analysis,
        "suggestions": record.suggestions,
    }


@router.get(
    "/{conversation_id}/report/export",
    response_class=Response,
    responses={
        200: {"description": "Report file (PDF, DOCX, or MD)"},
        400: {"description": "Invalid format or no report"},
        404: {"description": "Not found"},
    },
)
async def export_report(
    conversation_id: UUID,
    db: DBSession,
    fmt: str = Query("pdf", alias="format"),
    current_user: User = Depends(get_current_user),
):
    """Export report with embedded visualization images.

    fmt: pdf | docx | md (query param)
    Returns file with images: image centered above insight text.
    """
    from app.repositories import conversation_repo, report_repo, visualization_repo
    from app.services.report_export_service import (
        export_docx,
        export_markdown,
        export_pdf,
    )

    if not await conversation_repo.belongs_to_user(db, conversation_id, current_user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    record = await report_repo.get_report(db, conversation_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    viz_rows = await visualization_repo.list_by_conversation(db, conversation_id)
    done_with_annotation = [r for r in viz_rows if r.status == "done" and r.annotation]
    if not done_with_annotation:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No visualizations with annotations.",
        )

    viz_images: list[bytes] = []
    for r in done_with_annotation:
        img = await visualization_repo.get_image(
            db, conversation_id=conversation_id, task_id=r.task_id
        )
        viz_images.append(img if img else b"")

    filename_base = "insights-summary"
    fmt_normalized = fmt.lower().strip()
    if fmt_normalized == "pdf":
        content, filename = export_pdf(
            record.dataset_overview,
            record.key_findings,
            record.relationship_analysis,
            record.suggestions,
            viz_images,
            filename_base,
        )
        media_type = "application/pdf"
    elif fmt_normalized == "docx":
        content, filename = export_docx(
            record.dataset_overview,
            record.key_findings,
            record.relationship_analysis,
            record.suggestions,
            viz_images,
            filename_base,
        )
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    elif fmt_normalized == "md":
        content, filename = export_markdown(
            record.dataset_overview,
            record.key_findings,
            record.relationship_analysis,
            record.suggestions,
            viz_images,
            filename_base,
        )
        media_type = "text/markdown; charset=utf-8"
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid format. Use pdf, docx, or md.",
        )

    return Response(
        content=content,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


@router.delete(
    "/{conversation_id}/messages",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def clear_messages(
    conversation_id: UUID,
    conversation_service: ConversationSvc,
    current_user: User = Depends(get_current_user),
):
    """Clear all messages in a conversation."""
    await conversation_service.clear_messages(conversation_id, current_user)
