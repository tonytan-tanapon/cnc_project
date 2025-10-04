"""add second_due_date to po_lines

Revision ID: b008907cf530
Revises: 32a7dcac0cd2
Create Date: 2025-10-03 15:07:13.661668

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b008907cf530'
down_revision: Union[str, Sequence[str], None] = '32a7dcac0cd2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.add_column("po_lines", sa.Column("second_due_date", sa.Date(), nullable=True))

def downgrade():
    op.drop_column("po_lines", "second_due_date")
