"""ChatMessage repository (PostgreSQL async)."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.conversation import ChatMessage


async def get_by_id(db: AsyncSession, message_id: UUID) -> ChatMessage | None:
    """Get message by ID."""
    return await db.get(ChatMessage, message_id)


async def create(
    db: AsyncSession,
    *,
    conversation_id: UUID,
    role: str,
    content: str = "",
    tool_calls: list | None = None,
    is_streaming: bool = False,
    group_id: str | None = None,
    csv_filename: str | None = None,
    csv_content: str | None = None,
) -> ChatMessage:
    """Create a new chat message."""
    msg = ChatMessage(
        conversation_id=conversation_id,
        role=role,
        content=content,
        tool_calls=tool_calls,
        is_streaming=is_streaming,
        group_id=group_id,
        csv_filename=csv_filename,
        csv_content=csv_content,
    )
    db.add(msg)
    await db.flush()
    await db.refresh(msg)
    return msg


async def update(
    db: AsyncSession,
    *,
    db_msg: ChatMessage,
    update_data: dict,
) -> ChatMessage:
    """Update a chat message."""
    for field, value in update_data.items():
        setattr(db_msg, field, value)

    db.add(db_msg)
    await db.flush()
    await db.refresh(db_msg)
    return db_msg


async def delete_all_in_conversation(db: AsyncSession, conversation_id: UUID) -> None:
    """Delete all messages in a conversation."""
    from sqlalchemy import delete

    await db.execute(delete(ChatMessage).where(ChatMessage.conversation_id == conversation_id))
    await db.flush()


async def get_first_csv_filename_by_conversation_ids(
    db: AsyncSession,
    conversation_ids: list[UUID],
) -> dict[UUID, str]:
    """Get first csv_filename per conversation (from earliest message with csv_filename).

    Returns mapping conv_id -> filename. Omits conversations with no csv message.
    """
    if not conversation_ids:
        return {}
    # Subquery: rank messages with csv_filename by created_at per conversation
    from sqlalchemy import func

    subq = select(
        ChatMessage.conversation_id,
        ChatMessage.csv_filename,
        func.row_number()
        .over(
            partition_by=ChatMessage.conversation_id,
            order_by=ChatMessage.created_at,
        )
        .label("rn"),
    ).where(
        ChatMessage.conversation_id.in_(conversation_ids),
        ChatMessage.csv_filename.isnot(None),
        ChatMessage.csv_filename != "",
    )
    subq = subq.subquery()
    result = await db.execute(
        select(subq.c.conversation_id, subq.c.csv_filename).where(subq.c.rn == 1)
    )
    return {row.conversation_id: row.csv_filename for row in result.all()}
