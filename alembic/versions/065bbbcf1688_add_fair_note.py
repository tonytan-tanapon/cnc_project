"""add fair note

Revision ID: 065bbbcf1688
Revises: 23b883c5e05b
Create Date: 2025-10-09 09:44:23.892462

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '065bbbcf1688'
down_revision: Union[str, Sequence[str], None] = '23b883c5e05b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('production_lots', sa.Column('fair_note', sa.Text(), nullable=True))
    pass


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('production_lots', 'fair_note')
    pass
