"""Report and conversation CSV context repositories."""

from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.report import ConversationCsvContext, DataReportRecord


async def upsert_csv_context(
    db: AsyncSession,
    *,
    conversation_id: UUID,
    csv_summary: dict[str, Any],
    enhanced_csv: str | None = None,
    original_csv: str | None = None,
    original_csv_summary: dict[str, Any] | None = None,
    mcq_context: list[dict[str, Any]] | None = None,
) -> ConversationCsvContext:
    """Insert or update CSV context for a conversation."""
    result = await db.execute(
        select(ConversationCsvContext).where(
            ConversationCsvContext.conversation_id == conversation_id
        )
    )
    row = result.scalars().first()
    if row:
        row.csv_summary = csv_summary
        if enhanced_csv is not None:
            row.enhanced_csv = enhanced_csv
        if original_csv is not None:
            row.original_csv = original_csv
        if original_csv_summary is not None:
            row.original_csv_summary = original_csv_summary
        if mcq_context is not None:
            row.mcq_context = mcq_context
        db.add(row)
    else:
        payload: dict[str, Any] = {
            "conversation_id": conversation_id,
            "csv_summary": csv_summary,
            "enhanced_csv": enhanced_csv,
            "original_csv": original_csv,
            "original_csv_summary": original_csv_summary,
        }
        if mcq_context is not None:
            payload["mcq_context"] = mcq_context
        row = ConversationCsvContext(**payload)
        db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


async def get_csv_context(
    db: AsyncSession,
    conversation_id: UUID,
) -> ConversationCsvContext | None:
    """Get CSV context for a conversation."""
    result = await db.execute(
        select(ConversationCsvContext).where(
            ConversationCsvContext.conversation_id == conversation_id
        )
    )
    return result.scalars().first()


async def upsert_report(
    db: AsyncSession,
    *,
    conversation_id: UUID,
    dataset_overview: str,
    key_findings: list,
    relationship_analysis: list,
    suggestions: list,
) -> DataReportRecord:
    """Insert or update report for a conversation."""
    result = await db.execute(
        select(DataReportRecord).where(DataReportRecord.conversation_id == conversation_id)
    )
    row = result.scalars().first()
    if row:
        row.dataset_overview = dataset_overview
        row.key_findings = key_findings
        row.relationship_analysis = relationship_analysis
        row.suggestions = suggestions
        db.add(row)
    else:
        row = DataReportRecord(
            conversation_id=conversation_id,
            dataset_overview=dataset_overview,
            key_findings=key_findings,
            relationship_analysis=relationship_analysis,
            suggestions=suggestions,
        )
        db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


async def get_report(
    db: AsyncSession,
    conversation_id: UUID,
) -> DataReportRecord | None:
    """Get report for a conversation."""
    result = await db.execute(
        select(DataReportRecord).where(DataReportRecord.conversation_id == conversation_id)
    )
    return result.scalars().first()
