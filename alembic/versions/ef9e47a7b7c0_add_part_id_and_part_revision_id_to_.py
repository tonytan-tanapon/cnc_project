"""add part_id and part_revision_id to production_lots

Revision ID: ef9e47a7b7c0
Revises: 9ba354c7673f
Create Date: 2025-08-17 21:46:23.108689

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ef9e47a7b7c0'
down_revision: Union[str, Sequence[str], None] = '9ba354c7673f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    # 1) เพิ่มคอลัมน์แบบ nullable ก่อน
    op.add_column('production_lots', sa.Column('part_id', sa.Integer(), nullable=True))
    op.add_column('production_lots', sa.Column('part_revision_id', sa.Integer(), nullable=True))

    # 2) (เลือก 1 ใน 3 วิธีด้านล่างเพื่อเติมค่าให้แถวเก่า)
    # 2.1 ถ้าตาราง production_lots ยังว่างอยู่:
    #   ข้ามขั้นตอน backfill ได้เลย

    # 2.2 ถ้าต้องการตั้งค่าให้แถวเก่าเป็น "UNKNOWN":
    #   สร้าง part/part_revision placeholder แล้วอัปเดตแถวเก่าให้ชี้ไปที่ placeholder
    op.execute("""
        INSERT INTO parts (part_no, name, status)
        VALUES ('UNKNOWN', 'Unknown Part', 'active')
        ON CONFLICT (part_no) DO NOTHING;
    """)
    op.execute("""
        INSERT INTO part_revisions (part_id, rev, is_current)
        SELECT id, 'A', TRUE FROM parts WHERE part_no='UNKNOWN'
        ON CONFLICT (part_id, rev) DO NOTHING;
    """)
    op.execute("""
        WITH pr AS (
          SELECT pr.id AS part_revision_id, pr.part_id
          FROM part_revisions pr
          JOIN parts p ON p.id = pr.part_id
          WHERE p.part_no='UNKNOWN' AND pr.rev='A'
        )
        UPDATE production_lots pl
        SET part_id = pr.part_id,
            part_revision_id = pr.part_revision_id
        FROM pr
        WHERE pl.part_id IS NULL;
    """)

    # 2.3 (ทางเลือกแทนข้อ 2.2): ถ้าคุณจะลบแถวเก่าทิ้ง
    # op.execute("DELETE FROM production_lots WHERE part_id IS NULL;")

    # 3) ตอนนี้ทุกแถวมีค่าแล้ว ค่อยบังคับ NOT NULL
    op.alter_column('production_lots', 'part_id', existing_type=sa.Integer(), nullable=False)
    op.alter_column('production_lots', 'part_revision_id', existing_type=sa.Integer(), nullable=False)

    # 4) ใส่ Foreign Keys + ดัชนี
    op.create_foreign_key('fk_prod_lots_part', 'production_lots', 'parts', ['part_id'], ['id'])
    op.create_foreign_key('fk_prod_lots_partrev', 'production_lots', 'part_revisions', ['part_revision_id'], ['id'])
    op.create_index('ix_production_lots_part_id', 'production_lots', ['part_id'])
    op.create_index('ix_production_lots_part_revision_id', 'production_lots', ['part_revision_id'])

def downgrade():
    op.drop_index('ix_production_lots_part_revision_id', table_name='production_lots')
    op.drop_index('ix_production_lots_part_id', table_name='production_lots')
    op.drop_constraint('fk_prod_lots_partrev', 'production_lots', type_='foreignkey')
    op.drop_constraint('fk_prod_lots_part', 'production_lots', type_='foreignkey')
    op.drop_column('production_lots', 'part_revision_id')
    op.drop_column('production_lots', 'part_id')
