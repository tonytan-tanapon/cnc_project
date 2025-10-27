"""add payroll_emp_id to employees

Revision ID: 3fe6433aa070
Revises: 25482a763b10
Create Date: 2025-10-27 15:37:36.360795

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3fe6433aa070'
down_revision: Union[str, Sequence[str], None] = '25482a763b10'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.add_column('employees', sa.Column('payroll_emp_id', sa.Integer(), nullable=True))
    op.create_index('ix_employees_payroll_emp_id', 'employees', ['payroll_emp_id'])

def downgrade():
    op.drop_index('ix_employees_payroll_emp_id', table_name='employees')
    op.drop_column('employees', 'payroll_emp_id')