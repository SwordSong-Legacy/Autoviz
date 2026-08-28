"""User Schemas"""

from uuid import UUID

from pydantic import EmailStr, Field

from app.schemas.base import BaseSchema, TimestampSchema


class UserBase(BaseSchema):
    email: EmailStr
    username: str | None = None


class UserCreate(UserBase):
    """For registration - includes plain password"""

    password: str = Field(min_length=8)


class UserUpdate(BaseSchema):
    username: str | None = None
    password: str | None = Field(default=None, min_length=8)


class UserRead(UserBase, TimestampSchema):
    """API responses - exclude password"""

    id: UUID
    is_active: bool = True


class Token(BaseSchema):
    """JWT token response"""

    access_token: str
    token_type: str = "Bearer"
