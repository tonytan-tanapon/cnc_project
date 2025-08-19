"""fix users.is_superuser default and backfill

Revision ID: 4cb8be2782de
Revises: f6c45b67b1b1
Create Date: 2025-08-18 22:11:46.274735

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4cb8be2782de'
down_revision: Union[str, Sequence[str], None] = 'f6c45b67b1b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
