"""make timestamps tz-aware

Revision ID: fb48a470a02f
Revises: 275d50552270
Create Date: 2025-09-03 10:35:09.379004

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'fb48a470a02f'
down_revision: Union[str, Sequence[str], None] = '275d50552270'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    # Convert time_entries columns to TIMESTAMPTZ
    op.alter_column(
        'time_entries', 'clock_in_at',
        type_=postgresql.TIMESTAMP(timezone=True),
        postgresql_using="clock_in_at AT TIME ZONE 'UTC'"
    )
    op.alter_column(
        'time_entries', 'clock_out_at',
        type_=postgresql.TIMESTAMP(timezone=True),
        postgresql_using="clock_out_at AT TIME ZONE 'UTC'"
    )

    # Convert break_entries columns to TIMESTAMPTZ
    op.alter_column(
        'break_entries', 'start_at',
        type_=postgresql.TIMESTAMP(timezone=True),
        postgresql_using="start_at AT TIME ZONE 'UTC'"
    )
    op.alter_column(
        'break_entries', 'end_at',
        type_=postgresql.TIMESTAMP(timezone=True),
        postgresql_using="end_at AT TIME ZONE 'UTC'"
    )


def downgrade():
    # Rollback to TIMESTAMP WITHOUT TIME ZONE
    op.alter_column(
        'time_entries', 'clock_in_at',
        type_=postgresql.TIMESTAMP(timezone=False)
    )
    op.alter_column(
        'time_entries', 'clock_out_at',
        type_=postgresql.TIMESTAMP(timezone=False)
    )
    op.alter_column(
        'break_entries', 'start_at',
        type_=postgresql.TIMESTAMP(timezone=False)
    )
    op.alter_column(
        'break_entries', 'end_at',
        type_=postgresql.TIMESTAMP(timezone=False)
    )