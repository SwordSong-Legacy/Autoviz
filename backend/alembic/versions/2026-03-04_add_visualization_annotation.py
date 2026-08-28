"""Add annotation column to visualization_results

Revision ID: f8a9b0c1d2e3
Revises: e7f8a9b0c1d2
Create Date: 2026-03-04

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "f8a9b0c1d2e3"
down_revision: Union[str, None] = "e7f8a9b0c1d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "visualization_results",
        sa.Column("annotation", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("visualization_results", "annotation")
