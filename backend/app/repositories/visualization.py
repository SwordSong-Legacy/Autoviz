"""Visualization result repository (PostgreSQL async)."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.visualization import VisualizationResult


def _features_key(features: list[str]) -> str:
    return "+".join(sorted(features))


async def find_duplicate(
    db: AsyncSession,
    *,
    conversation_id: UUID,
    chart_type: str,
    features: list[str],
) -> VisualizationResult | None:
    """Find existing result with same (chart_type, features) for this conversation.

    Returns the result if found with status in_progress or done, else None.
    """
    fkey = _features_key(features)
    result = await db.execute(
        select(VisualizationResult).where(
            VisualizationResult.conversation_id == conversation_id,
            VisualizationResult.chart_type == chart_type,
            VisualizationResult.features_key == fkey,
            VisualizationResult.status.in_(["in_progress", "done"]),
        )
    )
    return result.scalars().first()


async def create(
    db: AsyncSession,
    *,
    conversation_id: UUID,
    task_id: str,
    chart_type: str,
    features: list[str],
    status: str,
    image_data: bytes | None = None,
    error_message: str | None = None,
    metadata: dict | None = None,
    started_at: datetime | None = None,
) -> VisualizationResult:
    """Create a visualization result record."""
    fkey = _features_key(features)
    row = VisualizationResult(
        conversation_id=conversation_id,
        task_id=task_id,
        chart_type=chart_type,
        features=features,
        features_key=fkey,
        status=status,
        image_data=image_data,
        error_message=error_message,
        metadata_=metadata,
        started_at=started_at,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


async def update_status(
    db: AsyncSession,
    *,
    conversation_id: UUID,
    task_id: str,
    status: str,
    image_data: bytes | None = None,
    error_message: str | None = None,
    annotation: str | None = None,
    metadata_patch: dict | None = None,
    duration_ms: int | None = None,
    code_rounds: int | None = None,
    semantic_replans: int | None = None,
) -> VisualizationResult | None:
    """Update status (and optionally image_data, annotation, metadata) of a result by task_id.

    metadata_patch is shallow-merged into existing metadata JSON (new keys overwrite).
    """
    result = await db.execute(
        select(VisualizationResult).where(
            VisualizationResult.conversation_id == conversation_id,
            VisualizationResult.task_id == task_id,
        )
    )
    row = result.scalars().first()
    if not row:
        return None
    row.status = status
    if image_data is not None:
        row.image_data = image_data
    if error_message is not None:
        row.error_message = error_message
    if annotation is not None:
        row.annotation = annotation
    if metadata_patch is not None:
        base = dict(row.metadata_) if row.metadata_ else {}
        base.update(metadata_patch)
        row.metadata_ = base
    if duration_ms is not None:
        row.duration_ms = duration_ms
    if code_rounds is not None:
        row.code_rounds = code_rounds
    if semantic_replans is not None:
        row.semantic_replans = semantic_replans
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


async def get_image(
    db: AsyncSession,
    *,
    conversation_id: UUID,
    task_id: str,
) -> bytes | None:
    """Get PNG bytes for a visualization result. Returns None if not found or no image."""
    result = await db.execute(
        select(VisualizationResult).where(
            VisualizationResult.conversation_id == conversation_id,
            VisualizationResult.task_id == task_id,
            VisualizationResult.status == "done",
        )
    )
    row = result.scalar_one_or_none()
    return row.image_data if row and row.image_data else None


async def list_by_conversation(
    db: AsyncSession,
    conversation_id: UUID,
) -> list[VisualizationResult]:
    """List all visualization results for a conversation, ordered by created_at."""
    result = await db.execute(
        select(VisualizationResult)
        .where(VisualizationResult.conversation_id == conversation_id)
        .order_by(VisualizationResult.created_at)
    )
    return list(result.scalars().all())


async def count_done_by_conversation_ids(
    db: AsyncSession,
    conversation_ids: list[UUID],
) -> dict[UUID, int]:
    """Count done visualizations per conversation. Returns mapping conv_id -> count."""
    from sqlalchemy import func

    if not conversation_ids:
        return {}
    result = await db.execute(
        select(
            VisualizationResult.conversation_id,
            func.count(VisualizationResult.id).label("cnt"),
        )
        .where(
            VisualizationResult.conversation_id.in_(conversation_ids),
            VisualizationResult.status == "done",
        )
        .group_by(VisualizationResult.conversation_id)
    )
    return {row.conversation_id: row.cnt for row in result.all()}
