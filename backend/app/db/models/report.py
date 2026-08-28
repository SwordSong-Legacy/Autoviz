"""Report and conversation CSV context database models."""

import uuid

from sqlalchemy import Column, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB as PG_JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlmodel import Field, SQLModel

from app.db.base import TimestampMixin


class ConversationCsvContext(TimestampMixin, SQLModel, table=True):
    """Stores the enhanced CSV summary for a conversation after viz pipeline runs.

    Used by the report agent to get dataset context when generating reports.
    One row per conversation; overwritten on each viz pipeline completion.
    """

    __tablename__ = "conversation_csv_contexts"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PG_UUID(as_uuid=True), primary_key=True),
    )
    conversation_id: uuid.UUID = Field(
        sa_column=Column(
            PG_UUID(as_uuid=True),
            ForeignKey("conversations.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
            index=True,
        )
    )
    csv_summary: dict = Field(
        default_factory=dict,
        sa_column=Column(PG_JSONB(), nullable=False),
    )
    original_csv_summary: dict | None = Field(
        default=None,
        sa_column=Column(PG_JSONB(), nullable=True),
    )
    enhanced_csv: str | None = Field(
        default=None,
        sa_column=Column(Text, nullable=True),
    )
    original_csv: str | None = Field(
        default=None,
        sa_column=Column(Text, nullable=True),
    )
    mcq_context: list | None = Field(
        default=None,
        sa_column=Column(PG_JSONB(), nullable=True),
    )


class DataReportRecord(TimestampMixin, SQLModel, table=True):
    """Persisted data analysis report for a conversation."""

    __tablename__ = "data_reports"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PG_UUID(as_uuid=True), primary_key=True),
    )
    conversation_id: uuid.UUID = Field(
        sa_column=Column(
            PG_UUID(as_uuid=True),
            ForeignKey("conversations.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
            index=True,
        )
    )
    dataset_overview: str = Field(
        default="",
        sa_column=Column(Text, nullable=False),
    )
    key_findings: list = Field(
        default_factory=list,
        sa_column=Column(PG_JSONB(), nullable=False),
    )
    relationship_analysis: list = Field(
        default_factory=list,
        sa_column=Column(PG_JSONB(), nullable=False),
    )
    suggestions: list = Field(
        default_factory=list,
        sa_column=Column(PG_JSONB(), nullable=False),
    )
