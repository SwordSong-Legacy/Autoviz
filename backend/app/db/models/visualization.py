"""Visualization result database model.

Each conversation has its own workspace: visualization results are scoped by
conversation_id. PNG images are stored as BYTEA for simplicity.
"""

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, LargeBinary, String, Text
from sqlalchemy.dialects.postgresql import JSONB as PG_JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlmodel import Field, SQLModel

from app.db.base import TimestampMixin


class VisualizationResult(TimestampMixin, SQLModel, table=True):
    """A single visualization (chart) generated for a conversation."""

    __tablename__ = "visualization_results"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PG_UUID(as_uuid=True), primary_key=True),
    )
    conversation_id: uuid.UUID = Field(
        sa_column=Column(
            PG_UUID(as_uuid=True),
            ForeignKey("conversations.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    task_id: str = Field(
        sa_column=Column(String(32), nullable=False, index=True),
    )
    chart_type: str = Field(
        sa_column=Column(String(50), nullable=False),
    )
    features: list[str] = Field(
        sa_column=Column(PG_JSONB(), nullable=False),
    )
    features_key: str = Field(
        sa_column=Column(String(500), nullable=False),
    )
    status: str = Field(
        sa_column=Column(String(20), nullable=False),
    )  # done | skipped | error
    image_data: bytes | None = Field(
        default=None,
        sa_column=Column(LargeBinary(), nullable=True),
    )
    error_message: str | None = Field(
        default=None,
        sa_column=Column(Text, nullable=True),
    )
    metadata_: dict | None = Field(
        default=None,
        sa_column=Column("metadata", PG_JSONB(), nullable=True),
    )
    annotation: str | None = Field(
        default=None,
        sa_column=Column(Text, nullable=True),
    )
    started_at: datetime | None = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    duration_ms: int | None = Field(
        default=None,
        sa_column=Column(Integer, nullable=True),
    )
    code_rounds: int | None = Field(
        default=None,
        sa_column=Column(Integer, nullable=True),
    )
    semantic_replans: int | None = Field(
        default=None,
        sa_column=Column(Integer, nullable=True),
    )
