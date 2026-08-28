"""User database model"""

import uuid

from sqlalchemy import Column, String
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlmodel import Field, SQLModel

from app.db.base import TimestampMixin


class User(TimestampMixin, SQLModel, table=True):
    __tablename__ = "users"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PG_UUID(as_uuid=True), primary_key=True),
    )
    email: str = Field(
        # Index?
        sa_column=Column(String(255), unique=True, nullable=False, index=True)
    )

    hashed_password: str = Field(
        # non-empty password
        sa_column=Column(String(255), nullable=False)
    )

    username: str | None = Field(
        default=None,
        # empty username is allowed
        sa_column=Column(String(100), nullable=True),
    )

    is_active: bool = Field(default=True)
