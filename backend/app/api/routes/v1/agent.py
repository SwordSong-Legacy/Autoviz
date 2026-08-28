"""AI Agent WebSocket routes with streaming support (PydanticAI)."""

import asyncio
import json
import logging
from dataclasses import dataclass
from dataclasses import field as dataclass_field
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic_ai import Agent
from pydantic_ai.messages import (
    ModelRequest,
    ModelResponse,
    SystemPromptPart,
    TextPart,
    UserPromptPart,
)
from pydantic_ai.models.openrouter import OpenRouterModel
from pydantic_ai.providers.openrouter import OpenRouterProvider
from pydantic_ai.settings import ModelSettings

from app.agents.assistant import AssistantAgent, Deps
from app.agents.llm_context import (
    clear_language_context,
    clear_llm_override,
    get_effective_api_key,
    get_effective_model,
    get_language_instruction,
    set_language_context,
    set_llm_override,
)
from app.agents.prompts import CHAT_SYSTEM_PROMPT_TEMPLATE
from app.agents.viz_quiz_agent import format_mcq_context, generate_quiz_question
from app.core.exceptions import AuthenticationError
from app.core.message_bus import VizResult
from app.core.security import decode_token
from app.db.models.user import User
from app.db.session import get_db_context
from app.pipelines.csv_preprocessor import CsvSummary, preprocess_csv, preprocess_csv_with_data
from app.pipelines.feature_engineer import run_feature_engineering
from app.pipelines.tabular_upload import normalize_tabular_upload_to_csv
from app.pipelines.visualization import run_visualization
from app.repositories import chat_message_repo, conversation_repo, report_repo
from app.services import analytics_service

logger = logging.getLogger(__name__)

router = APIRouter()


@dataclass
class ConnectionState:
    """Per-WebSocket state held during the MCQ question phase."""

    csv_content: str
    preprocessed_csv: str
    csv_summary: CsvSummary
    qa_pairs: list[dict[str, str]] = dataclass_field(default_factory=list)
    question_count: int = 0
    conversation_id: UUID | None = None
    run_feature_engineering: bool = True
    openrouter_api_key: str | None = None
    ai_model: str | None = None
    language: str = "en"
    pipeline_run_id: UUID | None = None
    csv_preprocess_duration_ms: int | None = None
    pipeline_started_at: datetime | None = None


class AgentConnectionManager:
    """WebSocket connection manager for AI agent."""

    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []
        self.connection_states: dict[int, ConnectionState] = {}

    async def connect(self, websocket: WebSocket) -> None:
        """Accept and store a new WebSocket connection."""
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        """Remove a WebSocket connection."""
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        self.connection_states.pop(id(websocket), None)

    def set_state(self, websocket: WebSocket, state: ConnectionState) -> None:
        """Store per-connection state for the MCQ quiz phase."""
        self.connection_states[id(websocket)] = state

    def get_state(self, websocket: WebSocket) -> ConnectionState | None:
        """Retrieve per-connection state, or None if not set."""
        return self.connection_states.get(id(websocket))

    def clear_state(self, websocket: WebSocket) -> None:
        """Remove per-connection state."""
        self.connection_states.pop(id(websocket), None)

    async def send_event(self, websocket: WebSocket, event_type: str, data: Any) -> bool:
        """Send a JSON event to a specific WebSocket client.

        Returns True if sent successfully, False if connection is closed.
        """
        try:
            await websocket.send_json({"type": event_type, "data": data})
            return True
        except (WebSocketDisconnect, RuntimeError):
            # Connection already closed
            return False


manager = AgentConnectionManager()


async def _get_user_from_websocket(websocket: WebSocket) -> User | None:
    """Get current user from WebSocket query param token. Returns None if unauthenticated."""
    from app.repositories import user_repo

    token = websocket.query_params.get("token") or websocket.query_params.get("access_token")
    if not token:
        return None
    try:
        user_id = decode_token(token)
        if not user_id:
            return None
        async with get_db_context() as db:
            user = await user_repo.get_by_id(db, UUID(user_id))
            return user
    except (AuthenticationError, ValueError):
        return None


async def _store_assistant_message(
    conversation_id: UUID,
    user: User,
    content: str,
    group_id: str | None = None,
) -> None:
    """Store assistant message in conversation. Logs errors but does not raise."""
    try:
        async with get_db_context() as db:
            conv = await conversation_repo.get_by_id(db, conversation_id)
            if not conv or conv.user_id != user.id:
                logger.warning("Conversation not found or not owned: %s", conversation_id)
                return
            await chat_message_repo.create(
                db,
                conversation_id=conversation_id,
                role="assistant",
                content=content,
                group_id=group_id,
            )
    except Exception as e:
        logger.exception("Failed to store assistant message: %s", e)


async def _store_user_message(
    conversation_id: UUID,
    user: User,
    content: str,
    group_id: str | None = None,
) -> None:
    """Store user message in conversation. Logs errors but does not raise."""
    try:
        async with get_db_context() as db:
            conv = await conversation_repo.get_by_id(db, conversation_id)
            if not conv or conv.user_id != user.id:
                return
            await chat_message_repo.create(
                db,
                conversation_id=conversation_id,
                role="user",
                content=content,
                group_id=group_id,
            )
    except Exception as e:
        logger.exception("Failed to store user message: %s", e)


async def _run_viz_pipeline(
    websocket: WebSocket,
    enhanced_csv: str,
    enhanced_summary: CsvSummary,
    conversation_id: UUID | None = None,
    user_preferences: str | None = None,
    pipeline_run_id: UUID | None = None,
    user_id: UUID | None = None,
    pipeline_started_at: datetime | None = None,
    csv_preprocess_duration_ms: int | None = None,
    mcq_questions_asked: int = 0,
    mcq_questions_answered: int = 0,
) -> None:
    """Run the visualization multi-agent pipeline and stream events to the WebSocket.

    Sends:
      viz_start          — pipeline started, with total planned chart count
      viz_task_complete  — each time a sub-agent finishes (status: done/skipped/error)
      viz_complete       — summary after all tasks are done
    """
    from app.core.config import settings

    planned = settings.VIZ_TARGET_CHARTS * settings.VIZ_TURNS
    await manager.send_event(
        websocket,
        "viz_start",
        {
            "message": "Visualization pipeline started (extra charts may be planned if critic rejects tasks)",
            "target_charts": settings.VIZ_TARGET_CHARTS,
            "turns": settings.VIZ_TURNS,
            "total_charts": planned,
        },
    )

    completed: list[VizResult] = []

    def on_turn_start(turn: int, total: int) -> None:
        asyncio.create_task(
            manager.send_event(
                websocket,
                "viz_turn_start",
                {
                    "turn": turn,
                    "total_turns": total,
                    "message": f"Starting visualization turn {turn}/{total}",
                },
            )
        )

    def on_viz_event(result: VizResult) -> None:
        """Called by each sub-agent coroutine as it completes (asyncio context)."""
        completed.append(result)
        asyncio.create_task(
            manager.send_event(
                websocket,
                "viz_task_complete",
                {
                    "task_id": result.task_id,
                    "chart_type": result.chart_type,
                    "features": result.features,
                    "status": result.status,
                    "image_path": result.image_path,
                    "error": result.error,
                    "metadata": result.metadata,
                    "annotation": result.metadata.get("annotation") if result.metadata else None,
                },
            )
        )

    try:
        results = await run_visualization(
            enhanced_csv=enhanced_csv,
            csv_summary=enhanced_summary,
            conversation_id=conversation_id,
            on_event=on_viz_event,
            on_turn_start=on_turn_start,
            user_preferences=user_preferences,
        )
        done_count = sum(1 for r in results if r.status == "done")
        skipped_count = sum(1 for r in results if r.status == "skipped")
        error_count = sum(1 for r in results if r.status == "error")

        _viz_ended_at = datetime.now(tz=UTC)
        _viz_total_ms = (
            int((_viz_ended_at - pipeline_started_at).total_seconds() * 1000)
            if pipeline_started_at
            else None
        )
        await analytics_service.record_behavior_event(
            "viz_pipeline_completed",
            conversation_id=conversation_id,
            user_id=user_id,
            metadata={
                "done": done_count,
                "skipped": skipped_count,
                "error": error_count,
                "total": len(results),
                "total_duration_ms": _viz_total_ms,
            },
        )
        if pipeline_run_id is not None:
            await analytics_service.complete_pipeline_run(
                pipeline_run_id,
                ended_at=_viz_ended_at,
                total_duration_ms=_viz_total_ms or 0,
                viz_planned=len(results),
                viz_done=done_count,
                viz_skipped=skipped_count,
                viz_error=error_count,
            )

        # Persist CSV context for report generation and generate-more
        if conversation_id:
            async with get_db_context() as db:
                await report_repo.upsert_csv_context(
                    db,
                    conversation_id=conversation_id,
                    csv_summary=enhanced_summary.to_dict(),
                    enhanced_csv=enhanced_csv,
                )

        await manager.send_event(
            websocket,
            "viz_complete",
            {
                "message": f"Visualization complete: {done_count} charts generated across {settings.VIZ_TURNS} turn(s).",
                "total": len(results),
                "turns": settings.VIZ_TURNS,
                "done": done_count,
                "skipped": skipped_count,
                "error": error_count,
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
    except Exception as viz_err:
        logger.exception("Visualization pipeline failed: %s", viz_err)
        await manager.send_event(
            websocket,
            "viz_error",
            {"message": str(viz_err)},
        )


async def _handle_mcq_answer(
    websocket: WebSocket,
    answer: str | None,
    user: User | None,
) -> None:
    """Process an mcq_answer message: ask next question or run full pipeline.

    answer=None means the user chose "Skip remaining questions".
    """
    state = manager.get_state(websocket)
    if state is None:
        await manager.send_event(websocket, "error", {"message": "No active quiz session"})
        return

    set_llm_override(api_key=state.openrouter_api_key, model=state.ai_model)
    set_language_context(state.language)

    try:
        # Record the answer for the last question sent
        if answer is not None and state.qa_pairs and not state.qa_pairs[-1].get("answer"):
            state.qa_pairs[-1]["answer"] = answer

        # Decide whether to ask another question
        should_ask_more = answer is not None and state.question_count < 3

        if should_ask_more:
            next_q = await generate_quiz_question(state.csv_summary, state.qa_pairs)
        else:
            next_q = None

        if next_q is not None:
            state.qa_pairs.append({"question": next_q.question, "answer": ""})
            state.question_count += 1
            await manager.send_event(
                websocket,
                "mcq_question",
                {
                    "question_index": state.question_count - 1,
                    "question": next_q.question,
                    "options": next_q.options,
                },
            )
            await manager.send_event(websocket, "complete", {})
            return

        # All questions done (or skipped) — run full pipeline
        answered_pairs = [qa for qa in state.qa_pairs if qa.get("answer")]
        user_prefs = format_mcq_context(answered_pairs) or None
        manager.clear_state(websocket)
        # `state` local variable remains valid even after clear_state removes it from the dict.
        # All subsequent accesses in this function use the local reference, not the manager dict.

        await analytics_service.record_behavior_event(
            "mcq_completed",
            conversation_id=state.conversation_id,
            metadata={
                "questions_asked": state.question_count,
                "questions_answered": len(answered_pairs),
                "skipped": answer is None,
            },
        )

        await manager.send_event(websocket, "start", {"message": "Visualization process started"})

        if state.run_feature_engineering and state.preprocessed_csv:
            await manager.send_event(
                websocket, "feature_eng_start", {"message": "Generating feature engineering code..."}
            )

            def on_code_generated(code: str) -> None:
                asyncio.create_task(
                    manager.send_event(websocket, "feature_eng_code", {"code": code})
                )

            def on_stdout(line: str) -> None:
                asyncio.create_task(
                    manager.send_event(websocket, "feature_eng_stdout", {"line": line})
                )

            def on_stderr(line: str) -> None:
                asyncio.create_task(
                    manager.send_event(websocket, "feature_eng_stderr", {"line": line})
                )

            try:
                enhanced_csv = await run_feature_engineering(
                    state.csv_summary,
                    state.preprocessed_csv,
                    on_code_generated=on_code_generated,
                    on_stdout=on_stdout,
                    on_stderr=on_stderr,
                    user_preferences=user_prefs,
                )
                enhanced_summary = await asyncio.to_thread(preprocess_csv, enhanced_csv)
                await manager.send_event(
                    websocket, "feature_eng_csv_summary", enhanced_summary.to_dict()
                )
                await manager.send_event(
                    websocket, "feature_eng_result", {"csv_content": enhanced_csv}
                )
            except Exception as fe_err:
                logger.exception("Feature engineering failed: %s", fe_err)
                await manager.send_event(
                    websocket, "feature_eng_error", {"message": str(fe_err)}
                )
                enhanced_csv = state.csv_content
                enhanced_summary = state.csv_summary

            if state.conversation_id:
                async with get_db_context() as db:
                    await report_repo.upsert_csv_context(
                        db,
                        conversation_id=state.conversation_id,
                        csv_summary=state.csv_summary.to_dict(),
                        enhanced_csv=enhanced_csv,
                        mcq_context=answered_pairs,
                    )

            await _run_viz_pipeline(
                websocket,
                enhanced_csv,
                enhanced_summary,
                conversation_id=state.conversation_id,
                user_preferences=user_prefs,
                pipeline_run_id=state.pipeline_run_id,
                pipeline_started_at=state.pipeline_started_at,
                csv_preprocess_duration_ms=state.csv_preprocess_duration_ms,
                mcq_questions_asked=state.question_count,
                mcq_questions_answered=len(answered_pairs),
            )
        else:
            if state.conversation_id:
                async with get_db_context() as db:
                    await report_repo.upsert_csv_context(
                        db,
                        conversation_id=state.conversation_id,
                        csv_summary=state.csv_summary.to_dict(),
                        mcq_context=answered_pairs,
                    )
            await _run_viz_pipeline(
                websocket,
                state.csv_content,
                state.csv_summary,
                conversation_id=state.conversation_id,
                user_preferences=user_prefs,
                pipeline_run_id=state.pipeline_run_id,
                pipeline_started_at=state.pipeline_started_at,
                csv_preprocess_duration_ms=state.csv_preprocess_duration_ms,
                mcq_questions_asked=state.question_count,
                mcq_questions_answered=len(answered_pairs),
            )

        # Store Q&A summary as assistant message for authenticated users
        if user and state.conversation_id and user_prefs:
            await _store_assistant_message(state.conversation_id, user, user_prefs)

        await manager.send_event(websocket, "complete", {})

    finally:
        clear_llm_override()
        clear_language_context()


def build_message_history(history: list[dict[str, str]]) -> list[ModelRequest | ModelResponse]:
    """Convert conversation history to PydanticAI message format."""
    model_history: list[ModelRequest | ModelResponse] = []

    for msg in history:
        if msg["role"] == "user":
            model_history.append(ModelRequest(parts=[UserPromptPart(content=msg["content"])]))
        elif msg["role"] == "assistant":
            model_history.append(ModelResponse(parts=[TextPart(content=msg["content"])]))
        elif msg["role"] == "system":
            model_history.append(ModelRequest(parts=[SystemPromptPart(content=msg["content"])]))

    return model_history


def _looks_like_generation_request(text: str) -> bool:
    """Detect explicit intent to generate new charts."""
    q = (text or "").lower()
    keywords = [
        "generate",
        "draw",
        "plot",
        "chart",
        "visualization",
        "create chart",
        "new chart",
        "new visualization",
        "visualize",
        "scatter",
        "line chart",
        "bar chart",
        "histogram",
        "heatmap",
        "box plot",
        "pie chart",
        "生成",
        "画图",
        "绘图",
        "生成图",
        "可视化",
        "趋势图",
        "散点图",
        "折线图",
        "柱状图",
        "箱线图",
        "热力图",
        "饼图",
    ]
    return any(k in q for k in keywords)


def _looks_like_global_report_question(text: str) -> bool:
    q = (text or "").lower()
    keywords = [
        "全局",
        "总体",
        "整体情况",
        "总体情况",
        "概览",
        "总览",
        "分析一下",
        "启发",
        "建议",
        "评价",
        "总结",
        "整体",
        "宏观",
        "洞察",
        "结论",
        "下一步",
        "策略",
        "风险",
        "insight",
        "summary",
        "overall",
        "overview",
        "high level",
        "big picture",
        "recommend",
        "recommendation",
        "what should",
    ]
    return any(k in q for k in keywords)


def _looks_like_numeric_question(text: str) -> bool:
    q = (text or "").lower()
    keywords = [
        "最大",
        "最小",
        "平均",
        "均值",
        "总和",
        "sum",
        "max",
        "min",
        "mean",
        "value",
        "第",
        "行",
        "列",
    ]
    return any(k in q for k in keywords)


def _format_report_context(report_record: Any) -> str:
    if report_record is None:
        return ""
    lines = ["Use this report context for global-level answers:"]
    if getattr(report_record, "dataset_overview", ""):
        lines.append(f"- Dataset overview: {report_record.dataset_overview}")
    key_findings = list(getattr(report_record, "key_findings", []) or [])
    if key_findings:
        lines.append("- Key findings:")
        for item in key_findings[:8]:
            theme = item.get("theme", "")
            summary = item.get("summary", "")
            if theme or summary:
                lines.append(f"  - {theme}: {summary}")
    rel = list(getattr(report_record, "relationship_analysis", []) or [])
    if rel:
        lines.append("- Relationship analysis:")
        for item in rel[:8]:
            variables = ", ".join(item.get("variables", []) or [])
            desc = item.get("description", "")
            lines.append(f"  - {variables}: {desc}")
    suggestions = list(getattr(report_record, "suggestions", []) or [])
    if suggestions:
        lines.append("- Suggestions:")
        for s in suggestions[:8]:
            lines.append(f"  - {s}")
    return "\n".join(lines)


async def _answer_global_report_question_with_llm(
    user_message: str, report_context_text: str
) -> str:
    """Answer global questions with a dedicated report-grounded LLM pass."""
    model = OpenRouterModel(
        get_effective_model(),
        provider=OpenRouterProvider(api_key=get_effective_api_key()),
    )
    global_qa_agent = Agent[None, str](
        model=model,
        model_settings=ModelSettings(temperature=0.2),
        system_prompt=(
            "You are a data analysis assistant answering global-level questions.\n"
            "Use the provided report context as primary evidence and answer the user's question directly.\n"
            "Do not ask clarification questions unless the user explicitly asks for clarification.\n"
            "If the user requests a fixed number of suggestions/insights, respect that number.\n"
            "Keep the answer concise, specific, and actionable."
            + get_language_instruction()
        ),
    )
    prompt = (
        f"User question:\n{user_message}\n\n"
        f"Report context:\n{report_context_text}\n\n"
        "Return only the final answer for the user."
    )
    result = await global_qa_agent.run(prompt)
    return result.output.strip()


async def _llm_classify_chat_intent(
    user_message: str,
    csv_summary: CsvSummary,
    has_report: bool,
) -> tuple[str, float]:
    """LLM fallback classifier for ambiguous questions."""
    model = OpenRouterModel(
        get_effective_model(),
        provider=OpenRouterProvider(api_key=get_effective_api_key()),
    )
    classifier = Agent[None, str](
        model=model,
        model_settings=ModelSettings(temperature=0.0),
        system_prompt=(
            "Classify user intent into one of: numeric_query, viz_generation, global_report_qa, uncertain.\n"
            "Return ONLY JSON: {\"intent\":\"...\",\"confidence\":0..1}.\n"
            "numeric_query: asks exact values/stats.\n"
            "viz_generation: asks to create/draw new chart(s).\n"
            "global_report_qa: asks overall insights/recommendations/summary.\n"
            "uncertain: unclear."
        ),
    )
    prompt = (
        f"User question: {user_message}\n"
        f"Has report: {has_report}\n"
        f"Columns: {list(csv_summary.column_types.keys())}\n"
        "Return JSON only."
    )
    try:
        result = await classifier.run(prompt)
        raw = result.output.strip()
        if raw.startswith("```"):
            lines = raw.splitlines()
            raw = "\n".join(lines[1:-1]).strip()
        parsed = json.loads(raw)
        intent = str(parsed.get("intent", "uncertain"))
        conf = float(parsed.get("confidence", 0.0))
        if intent not in {"numeric_query", "viz_generation", "global_report_qa", "uncertain"}:
            intent = "uncertain"
        return intent, conf
    except Exception:
        return "uncertain", 0.0


async def _classify_chat_intent(
    user_message: str,
    csv_summary: CsvSummary,
    has_report: bool,
) -> str:
    """Two-stage intent classification: rules first, LLM fallback."""
    if _looks_like_generation_request(user_message):
        return "viz_generation"
    # Global intent should be detected regardless of report existence.
    # When report is missing, we generate it on-demand downstream.
    if _looks_like_global_report_question(user_message):
        return "global_report_qa"
    if _looks_like_numeric_question(user_message):
        return "numeric_query"
    llm_intent, conf = await _llm_classify_chat_intent(user_message, csv_summary, has_report)
    if llm_intent != "uncertain" and conf >= 0.6:
        return llm_intent
    return "uncertain"


@router.websocket("/ws/agent")
async def agent_websocket(
    websocket: WebSocket,
) -> None:
    """WebSocket endpoint for AI agent with full event streaming.

    Uses PydanticAI iter() to stream all agent events including:
    - user_prompt: When user input is received
    - model_request_start: When model request begins
    - text_delta: Streaming text from the model
    - tool_call_delta: Streaming tool call arguments
    - tool_call: When a tool is called (with full args)
    - tool_result: When a tool returns a result
    - final_result: When the final result is ready
    - complete: When processing is complete
    - error: When an error occurs

    Expected input message format:
    {
        "message": "user message here",
        "history": [{"role": "user|assistant|system", "content": "..."}],
        "csv_content": "optional CSV/JSON file content to attach",
        "upload_filename": "optional original filename (.csv or .json)",
        "run_feature_engineering": "optional bool, run feature engineering after preprocessing",
        "conversation_id": "optional UUID, for storing assistant message when authenticated"
    }

    WebSocket URL supports ?token=xxx for auth (stores messages when complete).
    """

    await manager.connect(websocket)
    user = await _get_user_from_websocket(websocket)

    # Conversation state per connection
    conversation_history: list[dict[str, str]] = []
    deps = Deps()

    try:
        while True:
            # Receive user message (RuntimeError when connection closed mid-processing, e.g. Cloud Run timeout)
            try:
                data = await websocket.receive_json()
            except (WebSocketDisconnect, RuntimeError) as recv_err:
                logger.debug("WebSocket receive closed: %s", recv_err)
                break
            user_message = data.get("message", "")
            raw_tabular_content = data.get("csv_content") or None
            upload_filename = ((data.get("upload_filename") or "").strip() or "uploaded.csv")
            csv_content: str | None = None
            if raw_tabular_content:
                try:
                    csv_content = normalize_tabular_upload_to_csv(
                        upload_filename, raw_tabular_content
                    )
                except ValueError as parse_err:
                    await manager.send_event(
                        websocket,
                        "error",
                        {"message": f"Invalid upload file: {parse_err}"},
                    )
                    await manager.send_event(websocket, "complete", {})
                    continue
            conversation_id_str = data.get("conversation_id")
            # Optional per-request LLM overrides (user's own API key / model)
            openrouter_api_key = (data.get("openrouter_api_key") or "").strip() or None
            ai_model = (data.get("ai_model") or "").strip() or None
            language = (data.get("language") or "en").strip()
            if language not in ("en", "zh"):
                language = "en"
            conversation_id: UUID | None = None
            if conversation_id_str:
                try:
                    cid = UUID(conversation_id_str)
                    # Validate conversation exists to avoid FK violation (e.g. local-only id)
                    async with get_db_context() as db:
                        if await conversation_repo.get_by_id(db, cid) is not None:
                            conversation_id = cid
                except (ValueError, TypeError):
                    pass
            # Optionally accept history from client (or use server-side tracking)
            if "history" in data:
                conversation_history = data["history"]

            # Handle mcq_answer messages before regular processing
            if data.get("type") == "mcq_answer":
                answer_value: str | None = data.get("answer")
                await _handle_mcq_answer(websocket, answer_value, user)
                continue

            if not user_message.strip() and not csv_content:
                await manager.send_event(websocket, "error", {"message": "Empty message"})
                continue

            # Set per-request LLM overrides for this message (cleared in finally)
            set_llm_override(api_key=openrouter_api_key, model=ai_model)
            set_language_context(language)

            await manager.send_event(
                websocket, "user_prompt", {"content": user_message or "(CSV upload only)"}
            )

            try:
                # When CSV is attached: run preprocessing pipeline and send summary via WebSocket
                if csv_content:
                    run_fe = data.get("run_feature_engineering", True)

                    await manager.send_event(
                        websocket, "start", {"message": "Visualization process started"}
                    )
                    await manager.send_event(
                        websocket, "csv_processing_start", {"message": "Processing CSV..."}
                    )

                    _pipeline_started_at = datetime.now(tz=UTC)
                    _csv_preprocess_start = _pipeline_started_at
                    if run_fe:
                        csv_summary, preprocessed_csv = await asyncio.to_thread(
                            preprocess_csv_with_data, csv_content
                        )
                    else:
                        csv_summary = await asyncio.to_thread(preprocess_csv, csv_content)
                        preprocessed_csv = ""
                    _csv_preprocess_duration_ms = int(
                        (datetime.now(tz=UTC) - _csv_preprocess_start).total_seconds() * 1000
                    )

                    await manager.send_event(
                        websocket,
                        "csv_summary",
                        csv_summary.to_dict(),
                    )

                    await analytics_service.record_behavior_event(
                        "file_uploaded",
                        conversation_id=conversation_id,
                        user_id=user.id if user else None,
                        metadata={
                            "rows": csv_summary.row_count,
                            "columns": len(csv_summary.column_types),
                            "filename": upload_filename,
                        },
                    )
                    _pipeline_run_id = await analytics_service.create_pipeline_run(
                        conversation_id,
                        user.id if user else None,
                        started_at=_pipeline_started_at,
                        csv_rows=csv_summary.row_count,
                        csv_columns=len(csv_summary.column_types),
                        csv_preprocess_duration_ms=_csv_preprocess_duration_ms,
                        feature_eng_enabled=bool(run_fe),
                    )

                    # Persist original CSV summary for Data Upload display (before feature eng)
                    if conversation_id:
                        async with get_db_context() as db:
                            await report_repo.upsert_csv_context(
                                db,
                                conversation_id=conversation_id,
                                csv_summary=csv_summary.to_dict(),
                                original_csv=csv_content,
                                original_csv_summary=csv_summary.to_dict(),
                            )

                    # --- MCQ quiz phase ---
                    first_question = await generate_quiz_question(csv_summary, [])
                    if first_question:
                        await analytics_service.record_behavior_event(
                            "mcq_started",
                            conversation_id=conversation_id,
                            user_id=user.id if user else None,
                        )
                        manager.set_state(
                            websocket,
                            ConnectionState(
                                csv_content=csv_content,
                                preprocessed_csv=preprocessed_csv,
                                csv_summary=csv_summary,
                                qa_pairs=[{"question": first_question.question, "answer": ""}],
                                question_count=1,
                                conversation_id=conversation_id,
                                run_feature_engineering=run_fe,
                                openrouter_api_key=openrouter_api_key,
                                ai_model=ai_model,
                                language=language,
                                pipeline_run_id=_pipeline_run_id,
                                csv_preprocess_duration_ms=_csv_preprocess_duration_ms,
                                pipeline_started_at=_pipeline_started_at,
                            ),
                        )
                        await manager.send_event(
                            websocket,
                            "mcq_question",
                            {
                                "question_index": 0,
                                "question": first_question.question,
                                "options": first_question.options,
                            },
                        )
                        await manager.send_event(websocket, "complete", {})
                        continue  # wait for mcq_answer — pipeline runs from _handle_mcq_answer

                    # No questions — fall through to existing pipeline flow
                    await analytics_service.record_behavior_event(
                        "mcq_skipped",
                        conversation_id=conversation_id,
                        user_id=user.id if user else None,
                    )

                    # Accumulate assistant content for storage (matches frontend display)
                    assistant_content_parts: list[str] = [
                        csv_summary.to_display_text("CSV parsing complete")
                    ]

                    if run_fe and preprocessed_csv:
                        await manager.send_event(
                            websocket,
                            "feature_eng_start",
                            {"message": "Generating feature engineering code..."},
                        )
                        assistant_content_parts.append(
                            "\n\n🔧 Generating feature engineering code..."
                        )

                        def on_code_generated(code: str) -> None:
                            assistant_content_parts.append(
                                f"\n\n**Generated code:**\n```python\n{code}\n```"
                            )
                            asyncio.create_task(
                                manager.send_event(websocket, "feature_eng_code", {"code": code})
                            )

                        def on_stdout(line: str) -> None:
                            asyncio.create_task(
                                manager.send_event(websocket, "feature_eng_stdout", {"line": line})
                            )

                        def on_stderr(line: str) -> None:
                            asyncio.create_task(
                                manager.send_event(websocket, "feature_eng_stderr", {"line": line})
                            )

                        try:
                            enhanced_csv = await run_feature_engineering(
                                csv_summary,
                                preprocessed_csv,
                                on_code_generated=on_code_generated,
                                on_stdout=on_stdout,
                                on_stderr=on_stderr,
                                user_preferences=None,
                            )
                            # Run CsvSummary on enhanced output and send to frontend
                            enhanced_summary = await asyncio.to_thread(preprocess_csv, enhanced_csv)
                            await manager.send_event(
                                websocket,
                                "feature_eng_csv_summary",
                                enhanced_summary.to_dict(),
                            )
                            assistant_content_parts.append(
                                "\n\n"
                                + enhanced_summary.to_display_text("Enhanced dataframe summary")
                            )
                            line_count = len(enhanced_csv.split("\n"))
                            assistant_content_parts.append(
                                f"\n\n✅ **Feature engineering complete** – "
                                f"{line_count:,} rows in enhanced dataframe."
                            )
                            await manager.send_event(
                                websocket,
                                "feature_eng_result",
                                {"csv_content": enhanced_csv},
                            )

                            # --- Visualization multi-agent pipeline ---
                            await _run_viz_pipeline(
                                websocket,
                                enhanced_csv,
                                enhanced_summary,
                                conversation_id=conversation_id,
                                user_preferences=None,
                                pipeline_run_id=_pipeline_run_id,
                                user_id=user.id if user else None,
                                pipeline_started_at=_pipeline_started_at,
                                csv_preprocess_duration_ms=_csv_preprocess_duration_ms,
                            )

                        except Exception as fe_err:
                            logger.exception("Feature engineering failed: %s", fe_err)
                            assistant_content_parts.append(
                                f"\n\n❌ **Feature engineering failed:** {fe_err}"
                            )
                            await manager.send_event(
                                websocket,
                                "feature_eng_error",
                                {"message": str(fe_err)},
                            )

                    conversation_history.append(
                        {"role": "user", "content": user_message or "(CSV upload only)"}
                    )

                    # Store assistant message when authenticated and conversation_id provided
                    if user and conversation_id:
                        assistant_content = "".join(assistant_content_parts)
                        await _store_assistant_message(conversation_id, user, assistant_content)

                    await manager.send_event(websocket, "complete", {})

                else:
                    # --- Chat path: text message with existing conversation ---
                    await analytics_service.record_behavior_event(
                        "chat_turn",
                        conversation_id=conversation_id,
                        user_id=user.id if user else None,
                    )
                    if not conversation_id:
                        await manager.send_event(
                            websocket,
                            "error",
                            {"message": "No CSV file attached and no active conversation. Please upload a CSV file first."},
                        )
                        await manager.send_event(websocket, "complete", {})
                        continue

                    # Load CSV context stored during initial upload
                    async with get_db_context() as db:
                        csv_ctx = await report_repo.get_csv_context(db, conversation_id)
                        report_record = await report_repo.get_report(db, conversation_id)

                    if csv_ctx is None or not csv_ctx.csv_summary:
                        await manager.send_event(
                            websocket,
                            "error",
                            {"message": "No data context found. Please upload a CSV file first."},
                        )
                        await manager.send_event(websocket, "complete", {})
                        continue

                    csv_summary_dict: dict[str, Any] = csv_ctx.csv_summary
                    enhanced_csv = csv_ctx.enhanced_csv or ""
                    original_csv = csv_ctx.original_csv or ""
                    query_data_source = "original_csv" if original_csv else "enhanced_csv"
                    query_csv_summary_dict: dict[str, Any] = (
                        csv_ctx.original_csv_summary
                        if query_data_source == "original_csv" and csv_ctx.original_csv_summary
                        else csv_summary_dict
                    )

                    # Build CSV summary text for system prompt
                    csv_summary_obj = CsvSummary.from_dict(csv_summary_dict)
                    csv_summary_text = csv_summary_obj.to_prompt_text()
                    chat_intent = await _classify_chat_intent(
                        user_message=user_message,
                        csv_summary=csv_summary_obj,
                        has_report=report_record is not None,
                    )
                    # Global Q&A fallback: build report on-demand when missing.
                    if chat_intent == "global_report_qa" and report_record is None:
                        try:
                            from app.agents.report_agent import VizProperty
                            from app.agents.report_agent import (
                                generate_report as run_report_agent,
                            )
                            from app.repositories import visualization_repo

                            async with get_db_context() as db:
                                viz_rows = await visualization_repo.list_by_conversation(
                                    db, conversation_id
                                )
                            done_rows = [r for r in viz_rows if r.status == "done"]
                            if done_rows:
                                viz_props = []
                                for r in done_rows:
                                    vp = VizProperty.from_visualization_result(r)
                                    if not vp.annotation and r.metadata_:
                                        vp.annotation = str(
                                            r.metadata_.get("description")
                                            or r.metadata_.get("critic_reason")
                                            or ""
                                        )
                                    viz_props.append(vp)
                                generated_report = await run_report_agent(csv_summary_obj, viz_props)
                                async with get_db_context() as db:
                                    report_record = await report_repo.upsert_report(
                                        db,
                                        conversation_id=conversation_id,
                                        dataset_overview=generated_report.dataset_overview,
                                        key_findings=[
                                            f.model_dump() for f in generated_report.key_findings
                                        ],
                                        relationship_analysis=[
                                            r.model_dump()
                                            for r in generated_report.relationship_analysis
                                        ],
                                        suggestions=generated_report.suggestions,
                                    )
                                await analytics_service.record_behavior_event(
                                    "report_generated",
                                    conversation_id=conversation_id,
                                    user_id=user.id if user else None,
                                    metadata={"charts_used": len(done_rows), "on_demand": True},
                                )
                        except Exception as report_err:
                            logger.warning("On-demand report generation failed: %s", report_err)

                    report_context_text = (
                        _format_report_context(report_record)
                        if chat_intent == "global_report_qa" and report_record is not None
                        else ""
                    )

                    system_prompt = CHAT_SYSTEM_PROMPT_TEMPLATE.format(
                        csv_summary_text=csv_summary_text,
                        report_context_text=report_context_text,
                    ) + get_language_instruction()

                    chat_assistant = AssistantAgent(
                        system_prompt=system_prompt,
                        model_name=get_effective_model(),
                        api_key=get_effective_api_key(),
                    )

                    async def _send(event_type: str, data: Any) -> bool:
                        return await manager.send_event(websocket, event_type, data)

                    chat_deps = Deps(
                        user_id=str(user.id) if user else None,
                        user_name=user.email if user else None,
                        send_event_fn=_send,
                        conversation_id=conversation_id,
                        enhanced_csv=enhanced_csv,
                        original_csv=original_csv,
                        query_data_source=query_data_source,
                        query_csv_summary_dict=query_csv_summary_dict,
                        csv_summary_dict=csv_summary_dict,
                    )
                    chat_deps.metadata["chat_intent"] = chat_intent
                    # Only explicit visualization intent can generate charts in chat mode.
                    # This avoids "global overview" questions being misrouted to chart generation.
                    chat_deps.metadata["allow_generate_visualizations"] = (
                        chat_intent == "viz_generation"
                    )

                    # For global report Q&A, run a dedicated LLM pass that is explicitly
                    # grounded in the persisted report context (no chart-generation tools).
                    if chat_intent == "global_report_qa" and report_record is not None:
                        await manager.send_event(websocket, "chat_start", {})
                        try:
                            report_answer = await _answer_global_report_question_with_llm(
                                user_message=user_message,
                                report_context_text=report_context_text,
                            )
                        except Exception as global_qa_err:
                            logger.warning(
                                "Global report QA dedicated pass failed, fallback to chat agent: %s",
                                global_qa_err,
                            )
                            report_answer = ""

                        if report_answer:
                            await manager.send_event(
                                websocket,
                                "chat_delta",
                                {"content": report_answer},
                            )
                            conversation_history.append({"role": "user", "content": user_message})
                            conversation_history.append(
                                {"role": "assistant", "content": report_answer}
                            )
                            await manager.send_event(websocket, "complete", {})
                            continue

                    await manager.send_event(websocket, "chat_start", {})

                    # Build message history from client-supplied history
                    model_history = build_message_history(conversation_history)

                    # Stream LLM response
                    accumulated_text = ""
                    try:
                        async with chat_assistant.agent.run_stream(
                            user_message,
                            deps=chat_deps,
                            message_history=model_history,
                        ) as result:
                            async for text_delta in result.stream_text(delta=True):
                                accumulated_text += text_delta
                                await manager.send_event(
                                    websocket,
                                    "chat_delta",
                                    {"content": text_delta},
                                )
                    except Exception as chat_err:
                        logger.exception("Chat agent failed")
                        await manager.send_event(
                            websocket,
                            "error",
                            {"message": f"Chat failed: {chat_err}"},
                        )
                        await manager.send_event(websocket, "complete", {})
                        continue

                    # Fallback: if user clearly asked for chart generation but the model didn't
                    # call the tool, generate focused charts once to avoid "claimed generated
                    # but no image shown" UX.
                    if (
                        bool(chat_deps.metadata.get("allow_generate_visualizations", False))
                        and int(chat_deps.metadata.get("generated_viz_count", 0)) == 0
                    ):
                        await manager.send_event(
                            websocket,
                            "chat_viz_trigger",
                            {"focus": user_message, "num_charts": 1},
                        )
                        fallback_event_tasks: list[asyncio.Task[bool]] = []
                        fallback_sent_image = False

                        def _on_fallback_viz_event(result: VizResult) -> None:
                            nonlocal fallback_sent_image
                            # Chat fallback must surface only one most relevant chart.
                            # Ignore additional chart events once one image has been emitted.
                            if result.image_path and fallback_sent_image:
                                return
                            if result.image_path:
                                fallback_sent_image = True
                            if result.status == "done":
                                chat_deps.metadata["generated_viz_count"] = int(
                                    chat_deps.metadata.get("generated_viz_count", 0)
                                ) + 1
                            t = asyncio.create_task(
                                manager.send_event(
                                    websocket,
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
                                        "is_chat_viz": True,
                                    },
                                )
                            )
                            fallback_event_tasks.append(t)

                        try:
                            await run_visualization(
                                enhanced_csv=enhanced_csv,
                                csv_summary=csv_summary_obj,
                                conversation_id=conversation_id,
                                on_event=_on_fallback_viz_event,
                                num_turns=1,
                                target_charts=1,
                                user_preferences=f"Focus on: {user_message}",
                                extra_metadata={"is_chat_viz": True},
                            )
                            if fallback_event_tasks:
                                await asyncio.gather(
                                    *fallback_event_tasks, return_exceptions=True
                                )
                        except Exception as fallback_err:
                            logger.warning(
                                "Fallback chart generation failed for chat turn: %s",
                                fallback_err,
                            )

                    conversation_history.append({"role": "user", "content": user_message})
                    conversation_history.append({"role": "assistant", "content": accumulated_text})

                    await manager.send_event(websocket, "complete", {})

            except WebSocketDisconnect:
                # Client disconnected during processing - this is normal
                break
            except Exception as e:
                logger.exception(f"Error processing agent request: {e}")
                # Try to send error, but don't fail if connection is closed
                await manager.send_event(websocket, "error", {"message": str(e)})
            finally:
                clear_llm_override()
                clear_language_context()

    except WebSocketDisconnect:
        pass  # Normal disconnect
    finally:
        manager.disconnect(websocket)
