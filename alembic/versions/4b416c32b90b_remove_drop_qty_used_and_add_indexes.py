"""--remove drop_qty_used_and_add_indexes

Revision ID: 4b416c32b90b
Revises: a3859b199f9e
Create Date: 2025-09-25 16:41:23.988441

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4b416c32b90b'
down_revision: Union[str, Sequence[str], None] = 'a3859b199f9e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    # 1) ลบคอลัมน์ legacy (หรือจะ rename แทนก็ตามต่อด้านล่าง)
    with op.batch_alter_table("raw_batches") as b:
        b.drop_column("qty_used")   # ถ้า column ไม่มี ให้ลบ try/except เอง

    # 2) index สำหรับ query SUM(lot_material_use.qty) by batch_id
    op.create_index(
        "ix_lmu_batch", "lot_material_use", ["batch_id"], unique=False, if_not_exists=True
    )

    # 3) index สำหรับหา batch แบบ FIFO: (material_id, received_at)
    op.create_index(
        "ix_raw_batches_mat_recv",
        "raw_batches",
        ["material_id", "received_at"],
        unique=False,
        if_not_exists=True,
    )

def downgrade():
    # 1) เอา index ออก (ถ้าลง)
    op.drop_index("ix_raw_batches_mat_recv", table_name="raw_batches")
    op.drop_index("ix_lmu_batch", table_name="lot_material_use")

    # 2) ใส่คอลัมน์กลับ (ค่า default = 0)
    with op.batch_alter_table("raw_batches") as b:
        b.add_column(sa.Column("qty_used", sa.Numeric(18, 3), nullable=False, server_default="0"))