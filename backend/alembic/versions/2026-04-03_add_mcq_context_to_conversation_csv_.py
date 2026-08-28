
"""Add mcq_context to conversation_csv_contexts

Revision ID: f780f974d02e
Revises: c1d2e3f4a5b6
Create Date: 2026-04-03 19:40:45.622887

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'f780f974d02e'
down_revision: Union[str, None] = 'c1d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('conversation_csv_contexts', sa.Column('mcq_context', postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column('conversation_csv_contexts', 'mcq_context')
