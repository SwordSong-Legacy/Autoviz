"""Analytics repository: pipeline_run_logs and user_behavior_events."""

from datetime import datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.analytics import PipelineRunLog, UserBehaviorEvent


async def create_pipeline_run(
    db: AsyncSession,
    *,
    conversation_id: UUID | None,
    user_id: UUID | None,
    started_at: datetime,
    csv_rows: int | None = None,
    csv_columns: int | None = None,
    csv_preprocess_duration_ms: int | None = None,
    feature_eng_enabled: bool = False,
    feature_eng_duration_ms: int | None = None,
    feature_eng_success: bool | None = None,
    mcq_questions_asked: int = 0,
    mcq_questions_answered: int = 0,
) -> PipelineRunLog:
    """Insert a new pipeline run row (partial — call complete_pipeline_run on finish)."""
    row = PipelineRunLog(
        conversation_id=conversation_id,
        user_id=user_id,
        started_at=started_at,
        csv_rows=csv_rows,
        csv_columns=csv_columns,
        csv_preprocess_duration_ms=csv_preprocess_duration_ms,
        feature_eng_enabled=feature_eng_enabled,
        feature_eng_duration_ms=feature_eng_duration_ms,
        feature_eng_success=feature_eng_success,
        mcq_questions_asked=mcq_questions_asked,
        mcq_questions_answered=mcq_questions_answered,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


async def complete_pipeline_run(
    db: AsyncSession,
    *,
    run_id: UUID,
    ended_at: datetime,
    total_duration_ms: int,
    viz_planned: int,
    viz_done: int,
    viz_skipped: int,
    viz_error: int,
) -> None:
    """Update the run row with final timing and chart counts."""
    from sqlalchemy import select

    result = await db.execute(
        select(PipelineRunLog).where(PipelineRunLog.id == run_id)
    )
    row = result.scalar_one_or_none()
    if row is None:
        return
    row.ended_at = ended_at
    row.total_duration_ms = total_duration_ms
    row.viz_planned = viz_planned
    row.viz_done = viz_done
    row.viz_skipped = viz_skipped
    row.viz_error = viz_error
    db.add(row)
    await db.flush()


async def record_behavior_event(
    db: AsyncSession,
    *,
    event_name: str,
    conversation_id: UUID | None,
    user_id: UUID | None,
    occurred_at: datetime,
    metadata: dict | None,
) -> UserBehaviorEvent:
    """Append a user behavior event row."""
    row = UserBehaviorEvent(
        event_name=event_name,
        conversation_id=conversation_id,
        user_id=user_id,
        occurred_at=occurred_at,
        metadata_=metadata,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row
