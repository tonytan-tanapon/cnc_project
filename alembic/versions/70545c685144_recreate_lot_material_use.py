"""recreate lot_material_use

Revision ID: 70545c685144
Revises: 463aa6b0d80b
Create Date: 2025-10-01 21:14:37.580696

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '70545c685144'
down_revision: Union[str, Sequence[str], None] = '463aa6b0d80b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

from alembic import op
import sqlalchemy as sa

def upgrade():
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if not insp.has_table("lot_material_use"):
        # สร้างตารางใหม่ (ใส่คอลัมน์ครบตามโมเดลปัจจุบัน)
        op.create_table(
            "lot_material_use",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("lot_id", sa.Integer, sa.ForeignKey("production_lots.id"), nullable=False),
            sa.Column("batch_id", sa.Integer, sa.ForeignKey("raw_batches.id"), nullable=False),
            sa.Column("raw_material_id", sa.Integer, sa.ForeignKey("raw_materials.id"), nullable=True),  # สร้างเป็น NULL ก่อน
            sa.Column("qty", sa.Numeric(18,3), nullable=False),
            sa.Column("uom", sa.String, nullable=True),
            sa.Column("used_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
            sa.Column("used_by_id", sa.Integer, sa.ForeignKey("employees.id"), nullable=True),
            sa.Column("note", sa.Text, nullable=True),
        )
        op.create_index("ix_lmu_lot", "lot_material_use", ["lot_id"])
        op.create_index("ix_lmu_batch", "lot_material_use", ["batch_id"])
        op.create_index("ix_lmu_rm", "lot_material_use", ["raw_material_id"])
    else:
        # มีตารางแล้วค่อยเช็คว่ามีคอลัมน์หรือยัง
        cols = {c["name"] for c in insp.get_columns("lot_material_use")}
        if "raw_material_id" not in cols:
            op.add_column("lot_material_use", sa.Column("raw_material_id", sa.Integer, nullable=True))
            op.create_foreign_key(None, "lot_material_use", "raw_materials", ["raw_material_id"], ["id"])
            op.create_index("ix_lmu_rm", "lot_material_use", ["raw_material_id"])

    # backfill raw_material_id จาก batch_id -> raw_batches.material_id
    op.execute("""
        UPDATE lot_material_use lmu
        SET raw_material_id = rb.material_id
        FROM raw_batches rb
        WHERE lmu.batch_id = rb.id
          AND lmu.raw_material_id IS NULL
    """)

    # ค่อยเปลี่ยนเป็น NOT NULL หลัง backfill เสร็จ
    op.alter_column("lot_material_use", "raw_material_id",
                    existing_type=sa.Integer(),
                    nullable=False)

def downgrade():
    pass
