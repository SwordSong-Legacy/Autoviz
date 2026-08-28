"""Analytics service: fire-and-forget writes to analytics tables.

All public functions swallow exceptions and log them — analytics failures
must never interrupt the main request flow.
"""

import logging
from datetime import UTC, datetime
from uuid import UUID

from app.db.session import get_db_context
from app.repositories import analytics_repo

logger = logging.getLogger(__name__)


async def record_behavior_event(
    event_name: str,
    *,
    conversation_id: UUID | None = None,
    user_id: UUID | None = None,
    metadata: dict | None = None,
) -> None:
    """Emit a user behavior event. Errors are logged and swallowed."""
    try:
        async with get_db_context() as db:
            await analytics_repo.record_behavior_event(
                db,
                event_name=event_name,
                conversation_id=conversation_id,
                user_id=user_id,
                occurred_at=datetime.now(UTC),
                metadata=metadata,
            )
    except Exception:
        logger.exception("analytics: failed to record behavior event %r", event_name)


async def create_pipeline_run(
    conversation_id: UUID | None,
    user_id: UUID | None,
    *,
    started_at: datetime,
    csv_rows: int | None = None,
    csv_columns: int | None = None,
    csv_preprocess_duration_ms: int | None = None,
    feature_eng_enabled: bool = False,
    feature_eng_duration_ms: int | None = None,
    feature_eng_success: bool | None = None,
    mcq_questions_asked: int = 0,
    mcq_questions_answered: int = 0,
) -> UUID | None:
    """Create a pipeline run log row and return its ID. Returns None on failure."""
    try:
        async with get_db_context() as db:
            row = await analytics_repo.create_pipeline_run(
                db,
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
            return row.id
    except Exception:
        logger.exception("analytics: failed to create pipeline run")
        return None


async def complete_pipeline_run(
    run_id: UUID,
    *,
    ended_at: datetime,
    total_duration_ms: int,
    viz_planned: int,
    viz_done: int,
    viz_skipped: int,
    viz_error: int,
) -> None:
    """Finalize the pipeline run row with timing and chart counts. Errors are swallowed."""
    try:
        async with get_db_context() as db:
            await analytics_repo.complete_pipeline_run(
                db,
                run_id=run_id,
                ended_at=ended_at,
                total_duration_ms=total_duration_ms,
                viz_planned=viz_planned,
                viz_done=viz_done,
                viz_skipped=viz_skipped,
                viz_error=viz_error,
            )
    except Exception:
        logger.exception("analytics: failed to complete pipeline run %s", run_id)
