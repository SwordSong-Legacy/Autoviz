"""Add visualization_results table

Revision ID: e7f8a9b0c1d2
Revises: d5b875df7df6
Create Date: 2026-03-04

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "e7f8a9b0c1d2"
down_revision: Union[str, None] = "d5b875df7df6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "visualization_results",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("conversation_id", UUID(as_uuid=True), nullable=False),
        sa.Column("task_id", sa.String(length=32), nullable=False),
        sa.Column("chart_type", sa.String(length=50), nullable=False),
        sa.Column("features", JSONB(), nullable=False),
        sa.Column("features_key", sa.String(length=500), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("image_data", sa.LargeBinary(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("metadata", JSONB(), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("visualization_results_pkey")),
        sa.ForeignKeyConstraint(
            ["conversation_id"],
            ["conversations.id"],
            name=op.f("visualization_results_conversation_id_fkey"),
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        op.f("visualization_results_conversation_id_idx"),
        "visualization_results",
        ["conversation_id"],
        unique=False,
    )
    op.create_index(
        op.f("visualization_results_task_id_idx"),
        "visualization_results",
        ["task_id"],
        unique=False,
    )
    op.create_index(
        "visualization_results_conv_chart_features_idx",
        "visualization_results",
        ["conversation_id", "chart_type", "features_key"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "visualization_results_conv_chart_features_idx",
        table_name="visualization_results",
    )
    op.drop_index(
        op.f("visualization_results_task_id_idx"),
        table_name="visualization_results",
    )
    op.drop_index(
        op.f("visualization_results_conversation_id_idx"),
        table_name="visualization_results",
    )
    op.drop_table("visualization_results")
