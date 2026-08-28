"""Add csv_filename and csv_content to chat_messages

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-02-25

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "chat_messages",
        sa.Column("csv_filename", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "chat_messages",
        sa.Column("csv_content", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("chat_messages", "csv_content")
    op.drop_column("chat_messages", "csv_filename")
