"""Analytics database models: pipeline run logs and user behavior events."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB as PG_JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlmodel import Field, SQLModel

from app.db.base import TimestampMixin


class PipelineRunLog(TimestampMixin, SQLModel, table=True):
    """One row per run_visualization() invocation."""

    __tablename__ = "pipeline_run_logs"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PG_UUID(as_uuid=True), primary_key=True),
    )
    conversation_id: uuid.UUID | None = Field(
        default=None,
        sa_column=Column(
            PG_UUID(as_uuid=True),
            ForeignKey("conversations.id", ondelete="CASCADE"),
            nullable=True,
            index=True,
        ),
    )
    user_id: uuid.UUID | None = Field(
        default=None,
        sa_column=Column(
            PG_UUID(as_uuid=True),
            ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
    )
    started_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )
    ended_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    total_duration_ms: int | None = Field(
        default=None,
        sa_column=Column(Integer, nullable=True),
    )
    csv_rows: int | None = Field(default=None, sa_column=Column(Integer, nullable=True))
    csv_columns: int | None = Field(default=None, sa_column=Column(Integer, nullable=True))
    csv_preprocess_duration_ms: int | None = Field(
        default=None, sa_column=Column(Integer, nullable=True)
    )
    feature_eng_enabled: bool = Field(
        default=False, sa_column=Column(Boolean, nullable=False, server_default="false")
    )
    feature_eng_duration_ms: int | None = Field(
        default=None, sa_column=Column(Integer, nullable=True)
    )
    feature_eng_success: bool | None = Field(
        default=None, sa_column=Column(Boolean, nullable=True)
    )
    mcq_questions_asked: int = Field(
        default=0, sa_column=Column(Integer, nullable=False, server_default="0")
    )
    mcq_questions_answered: int = Field(
        default=0, sa_column=Column(Integer, nullable=False, server_default="0")
    )
    viz_planned: int = Field(
        default=0, sa_column=Column(Integer, nullable=False, server_default="0")
    )
    viz_done: int = Field(
        default=0, sa_column=Column(Integer, nullable=False, server_default="0")
    )
    viz_skipped: int = Field(
        default=0, sa_column=Column(Integer, nullable=False, server_default="0")
    )
    viz_error: int = Field(
        default=0, sa_column=Column(Integer, nullable=False, server_default="0")
    )


class UserBehaviorEvent(SQLModel, table=True):
    # No TimestampMixin: occurred_at is the authoritative timestamp for this append-only log.

    __tablename__ = "user_behavior_events"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PG_UUID(as_uuid=True), primary_key=True),
    )
    conversation_id: uuid.UUID | None = Field(
        default=None,
        sa_column=Column(
            PG_UUID(as_uuid=True),
            ForeignKey("conversations.id", ondelete="CASCADE"),
            nullable=True,
            index=True,
        ),
    )
    user_id: uuid.UUID | None = Field(
        default=None,
        sa_column=Column(
            PG_UUID(as_uuid=True),
            ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    event_name: str = Field(
        sa_column=Column(String(100), nullable=False, index=True),
    )
    occurred_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False, index=True),
    )
    metadata_: dict | None = Field(
        default=None,
        sa_column=Column("metadata", PG_JSONB(), nullable=True),
    )
