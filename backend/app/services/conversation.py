"""Conversation service (PostgreSQL async)."""

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.db.models.conversation import Conversation
from app.db.models.user import User
from app.repositories import chat_message_repo, conversation_repo
from app.schemas.conversation import (
    ChatMessageCreate,
    ChatMessageUpdate,
    ConversationCreate,
    ConversationUpdate,
)


class ConversationService:
    """Service for conversation and message business logic."""

    def __init__(self, db: AsyncSession):
        self.db = db

    def _ensure_ownership(self, conv: Conversation, user: User) -> None:
        """Raise NotFoundError if conversation does not belong to user."""
        if conv.user_id != user.id:
            raise NotFoundError(
                message="Conversation not found",
                details={"conversation_id": str(conv.id)},
            )

    async def get_by_id(self, conversation_id: UUID, user: User) -> Conversation:
        """Get conversation by ID. Raises NotFoundError if not found or not owned."""
        conv = await conversation_repo.get_by_id(self.db, conversation_id)
        if not conv:
            raise NotFoundError(
                message="Conversation not found",
                details={"conversation_id": str(conversation_id)},
            )
        self._ensure_ownership(conv, user)
        return conv

    async def get_by_id_with_messages(self, conversation_id: UUID, user: User) -> Conversation:
        """Get conversation with messages. Raises NotFoundError if not found or not owned."""
        conv = await conversation_repo.get_by_id_with_messages(self.db, conversation_id)
        if not conv:
            raise NotFoundError(
                message="Conversation not found",
                details={"conversation_id": str(conversation_id)},
            )
        self._ensure_ownership(conv, user)
        return conv

    async def get_multi(self, user: User, *, skip: int = 0, limit: int = 100) -> list[Conversation]:
        """Get user's conversations."""
        return await conversation_repo.get_multi_by_user(
            self.db, user_id=user.id, skip=skip, limit=limit
        )

    async def create(self, user: User, conv_in: ConversationCreate) -> Conversation:
        """Create a new conversation."""
        return await conversation_repo.create(
            self.db,
            user_id=user.id,
            title=conv_in.title,
        )

    async def update(
        self, conversation_id: UUID, user: User, conv_in: ConversationUpdate
    ) -> Conversation:
        """Update a conversation."""
        conv = await self.get_by_id(conversation_id, user)
        update_data = conv_in.model_dump(exclude_unset=True)
        return await conversation_repo.update(self.db, db_conv=conv, update_data=update_data)

    async def delete(self, conversation_id: UUID, user: User) -> None:
        """Delete a conversation."""
        conv = await self.get_by_id(conversation_id, user)
        await conversation_repo.delete(self.db, conversation_id)

    async def add_message(self, conversation_id: UUID, user: User, msg_in: ChatMessageCreate):
        """Add a message to a conversation."""
        conv = await self.get_by_id(conversation_id, user)
        data = msg_in.model_dump()
        msg = await chat_message_repo.create(
            self.db,
            conversation_id=conv.id,
            **data,
        )
        # Update conversation title from first user message if empty
        if not conv.title and msg.role == "user" and msg.content:
            title = msg.content[:50] + ("..." if len(msg.content) > 50 else "")
            await conversation_repo.update(self.db, db_conv=conv, update_data={"title": title})
        return msg

    async def add_message_with_csv(
        self,
        conversation_id: UUID,
        user: User,
        content: str,
        role: str,
        csv_filename: str,
        csv_content: str,
    ):
        """Add a message with an attached CSV file to a conversation."""
        conv = await self.get_by_id(conversation_id, user)
        msg = await chat_message_repo.create(
            self.db,
            conversation_id=conv.id,
            role=role,
            content=content,
            csv_filename=csv_filename,
            csv_content=csv_content,
        )
        if not conv.title and msg.role == "user" and msg.content:
            title = msg.content[:50] + ("..." if len(msg.content) > 50 else "")
            await conversation_repo.update(self.db, db_conv=conv, update_data={"title": title})
        return msg

    async def update_message(
        self,
        conversation_id: UUID,
        message_id: UUID,
        user: User,
        msg_in: ChatMessageUpdate,
    ):
        """Update a message (e.g. during streaming)."""
        conv = await self.get_by_id(conversation_id, user)
        msg = await chat_message_repo.get_by_id(self.db, message_id)
        if not msg or msg.conversation_id != conv.id:
            raise NotFoundError(
                message="Message not found",
                details={"message_id": str(message_id)},
            )
        update_data = msg_in.model_dump(exclude_unset=True)
        return await chat_message_repo.update(self.db, db_msg=msg, update_data=update_data)

    async def clear_messages(self, conversation_id: UUID, user: User) -> None:
        """Clear all messages in a conversation."""
        await self.get_by_id(conversation_id, user)
        await chat_message_repo.delete_all_in_conversation(self.db, conversation_id)
