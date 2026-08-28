"""Conversation and ChatMessage schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import Field, computed_field

from app.schemas.base import BaseSchema, TimestampSchema


# --- ToolCall (nested in ChatMessage) ---
class ToolCallSchema(BaseSchema):
    """Tool call within a message."""

    id: str
    name: str
    args: dict = Field(default_factory=dict)
    result: object | None = None
    status: str = Field(description="pending | running | completed | error")


# --- ChatMessage ---
class ChatMessageBase(BaseSchema):
    """Base message schema."""

    role: str = Field(description="user | assistant | system")
    content: str = Field(default="")
    tool_calls: list[ToolCallSchema] | None = None
    is_streaming: bool = False
    group_id: str | None = None
    csv_filename: str | None = None
    csv_content: str | None = None


class ChatMessageCreate(ChatMessageBase):
    """Schema for creating a message."""

    pass


class ChatMessageUpdate(BaseSchema):
    """Schema for updating a message (e.g. streaming)."""

    content: str | None = None
    tool_calls: list[ToolCallSchema] | None = None
    is_streaming: bool | None = None


class ChatMessageRead(ChatMessageBase, TimestampSchema):
    """Schema for reading a message."""

    id: UUID
    conversation_id: UUID

    @computed_field
    @property
    def timestamp(self) -> datetime:
        """Alias for created_at (matches frontend ChatMessage.timestamp)."""
        return self.created_at

    model_config = {"from_attributes": True}


# --- Conversation ---
class ConversationBase(BaseSchema):
    """Base conversation schema."""

    title: str | None = None


class ConversationCreate(ConversationBase):
    """Schema for creating a conversation."""

    pass


class ConversationUpdate(BaseSchema):
    """Schema for updating a conversation (e.g. rename)."""

    title: str | None = None


class ConversationRead(ConversationBase, TimestampSchema):
    """Schema for reading a conversation (without messages)."""

    id: UUID
    user_id: UUID


class ConversationListRead(ConversationRead):
    """Extended schema for list endpoint with viz_count and csv_filename."""

    viz_count: int = 0
    csv_filename: str | None = None


class ConversationWithMessagesRead(ConversationRead):
    """Schema for reading a conversation with its messages."""

    messages: list[ChatMessageRead] = Field(default_factory=list)
