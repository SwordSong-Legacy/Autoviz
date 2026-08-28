"""Add conversation_csv_contexts and data_reports tables

Revision ID: a9b0c1d2e3f4
Revises: f8a9b0c1d2e3
Create Date: 2026-03-04

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "a9b0c1d2e3f4"
down_revision: Union[str, None] = "f8a9b0c1d2e3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "conversation_csv_contexts",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("conversation_id", UUID(as_uuid=True), nullable=False),
        sa.Column("csv_summary", JSONB(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("conversation_csv_contexts_pkey")),
        sa.ForeignKeyConstraint(
            ["conversation_id"],
            ["conversations.id"],
            name=op.f("conversation_csv_contexts_conversation_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "conversation_id",
            name=op.f("conversation_csv_contexts_conversation_id_key"),
        ),
    )
    op.create_index(
        op.f("conversation_csv_contexts_conversation_id_idx"),
        "conversation_csv_contexts",
        ["conversation_id"],
        unique=True,
    )

    op.create_table(
        "data_reports",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("conversation_id", UUID(as_uuid=True), nullable=False),
        sa.Column("dataset_overview", sa.Text(), nullable=False),
        sa.Column("key_findings", JSONB(), nullable=False),
        sa.Column("relationship_analysis", JSONB(), nullable=False),
        sa.Column("suggestions", JSONB(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("data_reports_pkey")),
        sa.ForeignKeyConstraint(
            ["conversation_id"],
            ["conversations.id"],
            name=op.f("data_reports_conversation_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "conversation_id",
            name=op.f("data_reports_conversation_id_key"),
        ),
    )
    op.create_index(
        op.f("data_reports_conversation_id_idx"),
        "data_reports",
        ["conversation_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("data_reports_conversation_id_idx"),
        table_name="data_reports",
    )
    op.drop_table("data_reports")
    op.drop_index(
        op.f("conversation_csv_contexts_conversation_id_idx"),
        table_name="conversation_csv_contexts",
    )
    op.drop_table("conversation_csv_contexts")
