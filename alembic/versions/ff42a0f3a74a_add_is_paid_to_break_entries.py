"""add is_paid to break_entries

Revision ID: ff42a0f3a74a
Revises: 00dc7b28f10e
Create Date: 2025-08-19 22:11:32.091561

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ff42a0f3a74a'
down_revision: Union[str, Sequence[str], None] = '00dc7b28f10e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.add_column(
        'break_entries',
        sa.Column('is_paid', sa.Boolean(), nullable=False, server_default=sa.false())
    )
    op.alter_column('break_entries', 'is_paid', server_default=None)

def downgrade():
    op.drop_column('break_entries', 'is_paid')