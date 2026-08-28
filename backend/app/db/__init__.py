"""Database module."""

# SQLModel uses SQLModel class directly as base, no separate Base class needed
from app.db.base import TimestampMixin

__all__ = ["TimestampMixin"]
