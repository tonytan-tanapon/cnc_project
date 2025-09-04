"""create reporting views

Revision ID: 38136817bdd1
Revises: d3d12ef61259
Create Date: 2025-09-03 22:04:48.219499

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '38136817bdd1'
down_revision: Union[str, Sequence[str], None] = 'd3d12ef61259'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    pass

def downgrade():
    pass