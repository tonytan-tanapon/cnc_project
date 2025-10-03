"""recreate lot_material_use

Revision ID: 3716a43f49ca
Revises: 7d46b125fafa
Create Date: 2025-10-01 21:09:00.851294

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3716a43f49ca'
down_revision: Union[str, Sequence[str], None] = '7d46b125fafa'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    # สร้างตารางตามสคีมาใหม่
    op.create_table(
        "lot_material_use",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("lot_id", sa.Integer(), sa.ForeignKey("production_lots.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("batch_id", sa.Integer(), sa.ForeignKey("raw_batches.id", ondelete="RESTRICT"), nullable=False, index=True),

        # คอลัมน์ที่คุณอยากมีตั้งแต่แรก
        sa.Column("raw_material_id", sa.Integer(), sa.ForeignKey("raw_materials.id", ondelete="RESTRICT"), nullable=False, index=True),
        sa.Column("qty", sa.Numeric(18, 3), nullable=False),
        sa.Column("uom", sa.String(), nullable=True),
        sa.Column("used_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("used_by_id", sa.Integer(), sa.ForeignKey("employees.id", ondelete="SET NULL"), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
    )

    # ดัชนีที่ใช้บ่อย
    op.create_index("ix_lmu_lot", "lot_material_use", ["lot_id"])
    op.create_index("ix_lmu_batch", "lot_material_use", ["batch_id"])
    op.create_index("ix_lmu_rm", "lot_material_use", ["raw_material_id"])

def downgrade():
    op.drop_index("ix_lmu_rm", table_name="lot_material_use")
    op.drop_index("ix_lmu_batch", table_name="lot_material_use")
    op.drop_index("ix_lmu_lot", table_name="lot_material_use")
    op.drop_table("lot_material_use")