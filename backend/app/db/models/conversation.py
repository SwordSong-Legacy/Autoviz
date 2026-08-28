"""Conversation and ChatMessage database models."""

import uuid

from sqlalchemy import Boolean, Column, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB as PG_JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlmodel import Field, Relationship, SQLModel

from app.db.base import TimestampMixin


class Conversation(TimestampMixin, SQLModel, table=True):
    """Conversation (chat thread) belonging to a user."""

    __tablename__ = "conversations"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PG_UUID(as_uuid=True), primary_key=True),
    )
    user_id: uuid.UUID = Field(
        sa_column=Column(
            PG_UUID(as_uuid=True),
            ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    title: str | None = Field(
        default=None,
        sa_column=Column(String(500), nullable=True),
    )

    messages: list["ChatMessage"] = Relationship(
        back_populates="conversation",
        sa_relationship_kwargs={
            "cascade": "all, delete-orphan",
            "order_by": "ChatMessage.created_at",
        },
    )


class ChatMessage(TimestampMixin, SQLModel, table=True):
    """Single message in a conversation."""

    __tablename__ = "chat_messages"

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
    role: str = Field(
        sa_column=Column(String(20), nullable=False),
    )  # user | assistant | system
    content: str = Field(
        default="",
        sa_column=Column(Text, nullable=False),
    )
    tool_calls: list | None = Field(
        default=None,
        sa_column=Column(PG_JSONB(), nullable=True),
    )
    is_streaming: bool = Field(
        default=False,
        sa_column=Column(Boolean, nullable=False),
    )
    group_id: str | None = Field(
        default=None,
        sa_column=Column(String(100), nullable=True),
    )
    csv_filename: str | None = Field(
        default=None,
        sa_column=Column(String(255), nullable=True),
    )
    csv_content: str | None = Field(
        default=None,
        sa_column=Column(Text, nullable=True),
    )

    # Use "Conversation" only - SQLAlchemy resolves by name; "Conversation | None" fails
    conversation: "Conversation" = Relationship(back_populates="messages")
