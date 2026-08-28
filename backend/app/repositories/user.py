from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.user import User


async def get_by_id(db: AsyncSession, user_id: UUID) -> User | None:
    return await db.get(User, user_id)


async def get_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_by_username(db: AsyncSession, username: str) -> User | None:
    result = await db.execute(select(User).where(User.username == username))
    return result.scalar_one_or_none()


async def create(
    db: AsyncSession, *, email: str, hashed_password: str, username: str | None = None
) -> User:
    """Create a new user"""
    user = User(
        email=email,
        hashed_password=hashed_password,
        username=username,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user
