"""Add enhanced_csv to conversation_csv_contexts

Revision ID: b0c1d2e3f4a5
Revises: a9b0c1d2e3f4
Create Date: 2026-03-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "b0c1d2e3f4a5"
down_revision: Union[str, None] = "a9b0c1d2e3f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "conversation_csv_contexts",
        sa.Column("enhanced_csv", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("conversation_csv_contexts", "enhanced_csv")
