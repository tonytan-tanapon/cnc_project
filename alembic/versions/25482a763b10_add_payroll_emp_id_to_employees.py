"""add payroll_emp_id to employees

Revision ID: 25482a763b10
Revises: 9fd2dd9a2b86
Create Date: 2025-10-27 15:35:06.869408

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '25482a763b10'
down_revision: Union[str, Sequence[str], None] = '9fd2dd9a2b86'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
