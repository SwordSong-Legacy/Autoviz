from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AlreadyExistsError, AuthenticationError
from app.core.security import hash_password, verify_password
from app.db.models.user import User
from app.repositories import user_repo
from app.schemas.user import UserCreate


class UserService:
    """Service for user-related business logic"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, user_id: UUID) -> User | None:
        """Get user by ID
        Raises:
            NotFoundError: If user does not exist
        """
        return await user_repo.get_by_id(self.db, user_id)

    async def get_by_email(self, email: str) -> User | None:
        return await user_repo.get_by_email(self.db, email)

    async def get_by_username(self, username: str) -> User | None:
        return await user_repo.get_by_username(self.db, username)

    async def create(self, user_in: UserCreate) -> User:
        existing = await self.get_by_email(user_in.email)
        if existing:
            raise AlreadyExistsError(
                message="Email already registered",
                details={"email": user_in.email},
            )
        hashed = hash_password(user_in.password)
        return await user_repo.create(
            self.db,
            email=user_in.email,
            hashed_password=hashed,
            username=user_in.username,
        )

    async def authenticate(self, identifier: str, password: str) -> User | None:
        """Authenticate by email or username. identifier is the value from OAuth2 form 'username' field."""
        user = (
            await self.get_by_email(identifier)
            if "@" in identifier
            else await self.get_by_username(identifier)
        )
        if not user or not verify_password(password, user.hashed_password):
            return None
        if not user.is_active:
            raise AuthenticationError(message="Account is disabled")
        return user
