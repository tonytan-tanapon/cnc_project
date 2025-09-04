"""add payroll_emp_id to time_entries

Revision ID: c2c4fb3e07a4
Revises: 8e1f4d58cacf
Create Date: 2025-09-03 21:22:13.262589

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c2c4fb3e07a4'
down_revision: Union[str, Sequence[str], None] = '8e1f4d58cacf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.add_column(
        "time_entries",
        sa.Column("payroll_emp_id", sa.Integer(), nullable=True)
    )
    op.create_index(
        "ix_time_entries_payroll_emp", "time_entries", ["payroll_emp_id"], unique=False
    )
    op.create_foreign_key(
        "fk_time_entries_payroll_emp",     # ← ตั้งชื่อไว้ จะได้ลบตอน downgrade ได้
        "time_entries",
        "employees",
        ["payroll_emp_id"],
        ["id"],
        ondelete="SET NULL",
    )

def downgrade():
    op.drop_constraint("fk_time_entries_payroll_emp", "time_entries", type_="foreignkey")
    op.drop_index("ix_time_entries_payroll_emp", table_name="time_entries")
    op.drop_column("time_entries", "payroll_emp_id")