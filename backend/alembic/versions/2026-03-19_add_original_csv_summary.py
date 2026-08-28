"""Add original_csv_summary to conversation_csv_contexts

Revision ID: c1d2e3f4a5b6
Revises: b0c1d2e3f4a5
Create Date: 2026-03-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "c1d2e3f4a5b6"
down_revision: Union[str, None] = "b0c1d2e3f4a5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "conversation_csv_contexts",
        sa.Column("original_csv_summary", JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("conversation_csv_contexts", "original_csv_summary")
