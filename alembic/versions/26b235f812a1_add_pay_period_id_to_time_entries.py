"""add pay_period_id to time_entries

Revision ID: 26b235f812a1
Revises: 7b9ab10e8cdd
Create Date: 2025-09-11 09:28:13.779501

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '26b235f812a1'
down_revision: Union[str, Sequence[str], None] = '7b9ab10e8cdd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.add_column('time_entries', sa.Column('pay_period_id', sa.Integer(), nullable=True))
    op.create_index('ix_time_entries_pay_period_id', 'time_entries', ['pay_period_id'])
    op.create_foreign_key(
        'fk_time_entries_pay_period',
        source_table='time_entries',
        referent_table='pay_periods',
        local_cols=['pay_period_id'],
        remote_cols=['id'],
        ondelete='SET NULL'
    )

def downgrade():
    op.drop_constraint('fk_time_entries_pay_period', 'time_entries', type_='foreignkey')
    op.drop_index('ix_time_entries_pay_period_id', table_name='time_entries')
    op.drop_column('time_entries', 'pay_period_id')
