"""Add original_csv to conversation_csv_contexts

Revision ID: e1f2a3b4c5d6
Revises: f780f974d02e
Create Date: 2026-04-14

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "e1f2a3b4c5d6"
down_revision: Union[str, None] = "f780f974d02e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("conversation_csv_contexts")}

    if "original_csv" not in columns:
        op.add_column(
            "conversation_csv_contexts",
            sa.Column("original_csv", sa.Text(), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("conversation_csv_contexts")}

    if "original_csv" in columns:
        op.drop_column("conversation_csv_contexts", "original_csv")
