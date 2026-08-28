"""Conversation repository (PostgreSQL async)."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models.conversation import Conversation


async def get_by_id(db: AsyncSession, conversation_id: UUID) -> Conversation | None:
    """Get conversation by ID."""
    return await db.get(Conversation, conversation_id)


async def get_by_id_with_messages(db: AsyncSession, conversation_id: UUID) -> Conversation | None:
    """Get conversation by ID with messages eagerly loaded."""
    result = await db.execute(
        select(Conversation)
        .where(Conversation.id == conversation_id)
        .options(selectinload(Conversation.messages))
    )
    return result.scalars().first()


async def get_multi_by_user(
    db: AsyncSession,
    *,
    user_id: UUID,
    skip: int = 0,
    limit: int = 100,
) -> list[Conversation]:
    """Get conversations for a user, ordered by most recent first."""
    result = await db.execute(
        select(Conversation)
        .where(Conversation.user_id == user_id)
        .order_by(Conversation.updated_at.desc().nullslast(), Conversation.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return list(result.scalars().all())


async def create(
    db: AsyncSession,
    *,
    user_id: UUID,
    title: str | None = None,
) -> Conversation:
    """Create a new conversation."""
    conv = Conversation(user_id=user_id, title=title)
    db.add(conv)
    await db.flush()
    await db.refresh(conv)
    return conv


async def update(
    db: AsyncSession,
    *,
    db_conv: Conversation,
    update_data: dict,
) -> Conversation:
    """Update a conversation."""
    for field, value in update_data.items():
        setattr(db_conv, field, value)

    db.add(db_conv)
    await db.flush()
    await db.refresh(db_conv)
    return db_conv


async def delete(db: AsyncSession, conversation_id: UUID) -> Conversation | None:
    """Delete a conversation (cascades to messages)."""
    conv = await get_by_id(db, conversation_id)
    if conv:
        await db.delete(conv)
        await db.flush()
    return conv


async def belongs_to_user(db: AsyncSession, conversation_id: UUID, user_id: UUID) -> bool:
    """Check if conversation belongs to user."""
    conv = await get_by_id(db, conversation_id)
    return conv is not None and conv.user_id == user_id
