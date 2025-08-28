"""add qty fields to traveler steps

Revision ID: 0c0e44a9558f
Revises: 76b60d75f574
Create Date: 2025-08-27 23:39:13.643110

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0c0e44a9558f'
down_revision: Union[str, Sequence[str], None] = '76b60d75f574'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.add_column('shop_traveler_steps', sa.Column('qty_receive', sa.Numeric(18,3), nullable=False, server_default='0'))
    op.add_column('shop_traveler_steps', sa.Column('qty_accept',  sa.Numeric(18,3), nullable=False, server_default='0'))
    op.add_column('shop_traveler_steps', sa.Column('qty_reject',  sa.Numeric(18,3), nullable=False, server_default='0'))
    # เอา default ออกภายหลัง (optional)
    op.alter_column('shop_traveler_steps', 'qty_receive', server_default=None)
    op.alter_column('shop_traveler_steps', 'qty_accept',  server_default=None)
    op.alter_column('shop_traveler_steps', 'qty_reject',  server_default=None)

def downgrade():
    op.drop_column('shop_traveler_steps', 'qty_reject')
    op.drop_column('shop_traveler_steps', 'qty_accept')
    op.drop_column('shop_traveler_steps', 'qty_receive')