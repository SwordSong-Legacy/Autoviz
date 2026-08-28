"""Add analytics tables and viz timing columns

Revision ID: 4a2b8f9c1e3d
Revises: e1f2a3b4c5d6
Create Date: 2026-04-20

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "4a2b8f9c1e3d"
down_revision: Union[str, None] = "e1f2a3b4c5d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- pipeline_run_logs ---
    op.create_table(
        "pipeline_run_logs",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("conversation_id", UUID(as_uuid=True), nullable=True),
        sa.Column("user_id", UUID(as_uuid=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("total_duration_ms", sa.Integer(), nullable=True),
        sa.Column("csv_rows", sa.Integer(), nullable=True),
        sa.Column("csv_columns", sa.Integer(), nullable=True),
        sa.Column("csv_preprocess_duration_ms", sa.Integer(), nullable=True),
        sa.Column(
            "feature_eng_enabled",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
        sa.Column("feature_eng_duration_ms", sa.Integer(), nullable=True),
        sa.Column("feature_eng_success", sa.Boolean(), nullable=True),
        sa.Column(
            "mcq_questions_asked",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "mcq_questions_answered",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column("viz_planned", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("viz_done", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("viz_skipped", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("viz_error", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pipeline_run_logs_pkey")),
        sa.ForeignKeyConstraint(
            ["conversation_id"],
            ["conversations.id"],
            name=op.f("pipeline_run_logs_conversation_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("pipeline_run_logs_user_id_fkey"),
            ondelete="SET NULL",
        ),
    )
    op.create_index(
        op.f("pipeline_run_logs_conversation_id_idx"),
        "pipeline_run_logs",
        ["conversation_id"],
        unique=False,
    )
    op.create_index(
        op.f("pipeline_run_logs_user_id_idx"),
        "pipeline_run_logs",
        ["user_id"],
        unique=False,
    )

    # --- user_behavior_events ---
    op.create_table(
        "user_behavior_events",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("conversation_id", UUID(as_uuid=True), nullable=True),
        sa.Column("user_id", UUID(as_uuid=True), nullable=True),
        sa.Column("event_name", sa.String(length=100), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("metadata", JSONB(), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("user_behavior_events_pkey")),
        sa.ForeignKeyConstraint(
            ["conversation_id"],
            ["conversations.id"],
            name=op.f("user_behavior_events_conversation_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("user_behavior_events_user_id_fkey"),
            ondelete="SET NULL",
        ),
    )
    op.create_index(
        op.f("user_behavior_events_conversation_id_idx"),
        "user_behavior_events",
        ["conversation_id"],
        unique=False,
    )
    op.create_index(
        op.f("event_name_idx"),
        "user_behavior_events",
        ["event_name"],
        unique=False,
    )
    op.create_index(
        op.f("occurred_at_idx"),
        "user_behavior_events",
        ["occurred_at"],
        unique=False,
    )

    # --- visualization_results timing columns ---
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {
        col["name"] for col in inspector.get_columns("visualization_results")
    }

    if "started_at" not in existing_columns:
        op.add_column(
            "visualization_results",
            sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        )
    if "duration_ms" not in existing_columns:
        op.add_column(
            "visualization_results",
            sa.Column("duration_ms", sa.Integer(), nullable=True),
        )
    if "code_rounds" not in existing_columns:
        op.add_column(
            "visualization_results",
            sa.Column("code_rounds", sa.Integer(), nullable=True),
        )
    if "semantic_replans" not in existing_columns:
        op.add_column(
            "visualization_results",
            sa.Column("semantic_replans", sa.Integer(), nullable=True),
        )


def downgrade() -> None:
    # Remove viz timing columns
    op.drop_column("visualization_results", "semantic_replans")
    op.drop_column("visualization_results", "code_rounds")
    op.drop_column("visualization_results", "duration_ms")
    op.drop_column("visualization_results", "started_at")

    # Drop user_behavior_events
    op.drop_index(op.f("occurred_at_idx"), table_name="user_behavior_events")
    op.drop_index(op.f("event_name_idx"), table_name="user_behavior_events")
    op.drop_index(
        op.f("user_behavior_events_conversation_id_idx"),
        table_name="user_behavior_events",
    )
    op.drop_table("user_behavior_events")

    # Drop pipeline_run_logs
    op.drop_index(
        op.f("pipeline_run_logs_user_id_idx"), table_name="pipeline_run_logs"
    )
    op.drop_index(
        op.f("pipeline_run_logs_conversation_id_idx"), table_name="pipeline_run_logs"
    )
    op.drop_table("pipeline_run_logs")
