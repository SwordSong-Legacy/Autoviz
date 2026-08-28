"""API dependencies.

Dependency injection factories for services, repositories, and authentication.
"""
# ruff: noqa: I001, E402 - Imports structured for Jinja2 template conditionals

from typing import Annotated

from fastapi import Depends
from app.db.session import get_db_session
from sqlalchemy.ext.asyncio import AsyncSession


DBSession = Annotated[AsyncSession, Depends(get_db_session)]
from app.services.conversation import ConversationService
from app.services.item import ItemService
from app.services.user import UserService


def get_item_service(db: DBSession) -> ItemService:
    """Create ItemService instance with database session."""
    return ItemService(db)


ItemSvc = Annotated[ItemService, Depends(get_item_service)]


def get_user_service(db: DBSession) -> UserService:
    return UserService(db)


UserSvc = Annotated[UserService, Depends(get_user_service)]


def get_conversation_service(db: DBSession) -> ConversationService:
    return ConversationService(db)


ConversationSvc = Annotated[ConversationService, Depends(get_conversation_service)]

from fastapi import Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from app.core.exceptions import AuthenticationError
from app.db.models.user import User
from app.core.security import decode_token
from uuid import UUID
from app.repositories import user_repo


security = HTTPBearer(auto_error=False)


async def _resolve_user_from_token(db: DBSession, raw_token: str) -> User:
    """Decode token and return user. Raises AuthenticationError on failure."""
    user_id = decode_token(raw_token)
    if not user_id:
        raise AuthenticationError(message="Invalid or expired token")
    user = await user_repo.get_by_id(db, UUID(user_id))
    if not user:
        raise AuthenticationError(message="User not found")
    return user


async def get_current_user(
    db: DBSession, credentials: HTTPAuthorizationCredentials | None = Depends(security)
) -> User:
    if not credentials:
        raise AuthenticationError(message="Not authenticated")
    return await _resolve_user_from_token(db, credentials.credentials)


async def get_current_user_for_image(
    db: DBSession,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    token: str | None = Query(
        None, description="JWT for img src (cannot send Authorization header)"
    ),
) -> User:
    """Auth for image endpoint: accepts Bearer header or ?token= query param."""
    raw_token = credentials.credentials if credentials else token
    if not raw_token:
        raise AuthenticationError(message="Not authenticated")
    return await _resolve_user_from_token(db, raw_token)
