"""add lot_code to production_lots

Revision ID: e7e6100c1d5a
Revises: 5b7fa0d170da
Create Date: 2025-08-22 17:22:34.174826

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e7e6100c1d5a'
down_revision: Union[str, Sequence[str], None] = '5b7fa0d170da'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    # 1) เพิ่มคอลัมน์แบบ nullable ก่อน
    op.add_column("production_lots", sa.Column("lot_code", sa.String(), nullable=True))

    # 2) เติมค่า lot_code ให้ทุกแถวแบบรันนัมเบอร์ L0001, L0002, ...
    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id FROM production_lots ORDER BY id ASC")).fetchall()

    # หา prefix/width ที่ต้องการ
    prefix = "L"
    width = 4

    # อ่านโค้ดเดิมที่มี (กันชนกันถ้ามีอยู่แล้วในบางระบบ)
    existing = set(
        c[0] for c in conn.execute(sa.text("SELECT lot_code FROM production_lots WHERE lot_code IS NOT NULL"))
    )

    def next_code():
        i = 1
        while True:
            code = f"{prefix}{str(i).zfill(width)}"
            if code not in existing:
                existing.add(code)
                return code
            i += 1

    for (lot_id,) in rows:
        code = next_code()
        conn.execute(sa.text("UPDATE production_lots SET lot_code=:code WHERE id=:id"), {"code": code, "id": lot_id})

    # 3) สร้าง unique index/constraint
    op.create_index("ix_production_lots_lot_code", "production_lots", ["lot_code"], unique=True)

    # 4) ค่อยบังคับ not null เมื่อเติมครบแล้ว
    op.alter_column("production_lots", "lot_code", existing_type=sa.String(), nullable=False)

def downgrade():
    op.drop_index("ix_production_lots_lot_code", table_name="production_lots")
    op.drop_column("production_lots", "lot_code")