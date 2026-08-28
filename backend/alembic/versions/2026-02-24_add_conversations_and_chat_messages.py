"""Add conversations and chat_messages tables

Revision ID: a1b2c3d4e5f6
Revises: c9ee495c5c22
Create Date: 2026-02-24

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "c9ee495c5c22"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "conversations",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("conversations_pkey")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("conversations_user_id_fkey"),
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        op.f("conversations_user_id_idx"),
        "conversations",
        ["user_id"],
        unique=False,
    )

    op.create_table(
        "chat_messages",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("conversation_id", sa.UUID(), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("tool_calls", JSONB(), nullable=True),
        sa.Column("is_streaming", sa.Boolean(), nullable=False),
        sa.Column("group_id", sa.String(length=100), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("chat_messages_pkey")),
        sa.ForeignKeyConstraint(
            ["conversation_id"],
            ["conversations.id"],
            name=op.f("chat_messages_conversation_id_fkey"),
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        op.f("chat_messages_conversation_id_idx"),
        "chat_messages",
        ["conversation_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("chat_messages_conversation_id_idx"),
        table_name="chat_messages",
    )
    op.drop_table("chat_messages")
    op.drop_index(op.f("conversations_user_id_idx"), table_name="conversations")
    op.drop_table("conversations")
