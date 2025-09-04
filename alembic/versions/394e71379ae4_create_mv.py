"""'create_MV'

Revision ID: 394e71379ae4
Revises: 7c025cfea0bc
Create Date: 2025-09-03 23:08:46.653707

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '394e71379ae4'
down_revision: Union[str, Sequence[str], None] = '7c025cfea0bc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    pass


def downgrade():
    pass
