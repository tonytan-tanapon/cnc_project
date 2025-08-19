"""add default for time_entries.clock_in_at and status

Revision ID: 896eda5db2c5
Revises: c87947b65e46
Create Date: 2025-08-18 22:26:27.555468

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '896eda5db2c5'
down_revision: Union[str, Sequence[str], None] = 'c87947b65e46'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    # อัปเดตแถวที่มีค่า NULL ก่อน
    op.execute("UPDATE time_entries SET clock_in_at = NOW() WHERE clock_in_at IS NULL;")
    op.execute("UPDATE time_entries SET status = 'open' WHERE status IS NULL;")

    # เพิ่ม default NOW() ให้ clock_in_at
    op.alter_column(
        "time_entries",
        "clock_in_at",
        existing_type=sa.DateTime(),
        nullable=False,
        server_default=sa.func.now()
    )

    # เพิ่ม default 'open' ให้ status
    op.alter_column(
        "time_entries",
        "status",
        existing_type=sa.String(),
        nullable=False,
        server_default=sa.text("'open'")
    )

    # สร้าง partial unique index กัน clock-in ซ้อน
    op.create_index(
        "uq_time_entries_one_open",
        "time_entries",
        ["employee_id"],
        unique=True,
        postgresql_where=sa.text("status = 'open'")
    )

def downgrade():
    # เอา index ออก
    op.drop_index("uq_time_entries_one_open", table_name="time_entries")

    # เอา default ออก
    op.alter_column(
        "time_entries",
        "status",
        existing_type=sa.String(),
        nullable=False,
        server_default=None
    )
    op.alter_column(
        "time_entries",
        "clock_in_at",
        existing_type=sa.DateTime(),
        nullable=False,
        server_default=None
    )
