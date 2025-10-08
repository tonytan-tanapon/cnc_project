"""add family/form/grade to raw_materials

Revision ID: a8af33bc882b
Revises: fe36161a025e
Create Date: 2025-10-07 19:32:36.938236

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a8af33bc882b'
down_revision: Union[str, Sequence[str], None] = 'fe36161a025e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    with op.batch_alter_table("raw_materials") as batch:
        batch.add_column(sa.Column("family_code", sa.String(), nullable=True))
        batch.add_column(sa.Column("form_code",   sa.String(), nullable=True))
        batch.add_column(sa.Column("grade_code",  sa.String(), nullable=True))

def downgrade():
    with op.batch_alter_table("raw_materials") as batch:
        batch.drop_column("grade_code")
        batch.drop_column("form_code")
        batch.drop_column("family_code")
        