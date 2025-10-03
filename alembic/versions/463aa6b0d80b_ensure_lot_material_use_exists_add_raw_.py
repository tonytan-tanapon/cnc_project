"""ensure lot_material_use exists + add raw_material_id

Revision ID: 463aa6b0d80b
Revises: 3716a43f49ca
Create Date: 2025-10-01 21:10:46.739879

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '463aa6b0d80b'
down_revision: Union[str, Sequence[str], None] = '3716a43f49ca'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    bind = op.get_bind()
    insp = sa.inspect(bind)

    # 1) ถ้ายังไม่มีตาราง lot_material_use ให้สร้างก่อน
    if not insp.has_table("lot_material_use"):
        op.create_table(
            "lot_material_use",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("lot_id", sa.Integer(), sa.ForeignKey("production_lots.id", ondelete="CASCADE"), nullable=False),
            sa.Column("batch_id", sa.Integer(), sa.ForeignKey("raw_batches.id", ondelete="RESTRICT"), nullable=False),
            # สร้างแบบยังไม่บังคับ NOT NULL ก่อน เผื่อ backfill
            sa.Column("raw_material_id", sa.Integer(), sa.ForeignKey("raw_materials.id", ondelete="RESTRICT"), nullable=True),
            sa.Column("qty", sa.Numeric(18,3), nullable=False),
            sa.Column("uom", sa.String(), nullable=True),
            sa.Column("used_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
            sa.Column("used_by_id", sa.Integer(), sa.ForeignKey("employees.id", ondelete="SET NULL"), nullable=True),
            sa.Column("note", sa.Text(), nullable=True),
        )
        op.create_index("ix_lmu_lot", "lot_material_use", ["lot_id"])
        op.create_index("ix_lmu_batch", "lot_material_use", ["batch_id"])
        op.create_index("ix_lmu_rm", "lot_material_use", ["raw_material_id"])
    else:
        # 2) ถ้ามีตารางแล้ว แต่ยังไม่มีคอลัมน์ raw_material_id → เพิ่ม + backfill
        cols = [c["name"] for c in insp.get_columns("lot_material_use")]
        if "raw_material_id" not in cols:
            op.add_column("lot_material_use", sa.Column("raw_material_id", sa.Integer(), nullable=True))
            op.create_foreign_key("fk_lmu_rm", "lot_material_use", "raw_materials",
                                  ["raw_material_id"], ["id"], ondelete="RESTRICT")
            op.create_index("ix_lmu_rm", "lot_material_use", ["raw_material_id"])

    # 3) backfill raw_material_id จาก raw_batches.material_id
    #    (ทำงานได้ทั้งกรณีสร้างใหม่/หรือเพิ่งเพิ่มคอลัมน์)
    op.execute("""
        UPDATE lot_material_use lmu
        SET raw_material_id = rb.material_id
        FROM raw_batches rb
        WHERE lmu.batch_id = rb.id AND lmu.raw_material_id IS NULL
    """)

    # 4) ค่อยบังคับ NOT NULL เมื่อค่าเติมครบแล้ว
    op.alter_column("lot_material_use", "raw_material_id", nullable=False)


def downgrade():
    # ลดรูป: ถอยเฉพาะ NOT NULL/INDEX/FK; (ไม่ลบตารางเพื่อความปลอดภัย)
    try:
        op.alter_column("lot_material_use", "raw_material_id", nullable=True)
    except Exception:
        pass
    try:
        op.drop_index("ix_lmu_rm", table_name="lot_material_use")
    except Exception:
        pass
    try:
        op.drop_constraint("fk_lmu_rm", "lot_material_use", type_="foreignkey")
    except Exception:
        pass