"""add FAIR fields: InspectionRecord as source + pointers on PartRevision & ProductionLot

Revision ID: 8e1f4d58cacf
Revises: 7a9debeab78f
Create Date: 2025-09-03 20:52:28.130808
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '8e1f4d58cacf'
down_revision: Union[str, Sequence[str], None] = '7a9debeab78f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- InspectionRecord: add FAIR fields ---
    # เพิ่ม is_fair แบบ NOT NULL พร้อม server_default เพื่อกัน NotNullViolation
    op.add_column(
        'inspection_records',
        sa.Column('is_fair', sa.Boolean(), nullable=False, server_default=sa.text('false'))
    )
    op.add_column('inspection_records', sa.Column('fair_no', sa.String(), nullable=True))
    op.add_column('inspection_records', sa.Column('fair_doc_file', sa.String(), nullable=True))
    op.add_column('inspection_records', sa.Column('fair_date', sa.Date(), nullable=True))
    op.add_column('inspection_records', sa.Column('part_revision_id', sa.Integer(), nullable=True))

    op.create_index('ix_inspection_records_fair_rev', 'inspection_records',
                    ['part_revision_id', 'is_fair'], unique=False)
    op.create_index(op.f('ix_inspection_records_part_revision_id'), 'inspection_records',
                    ['part_revision_id'], unique=False)
    op.create_foreign_key('fk_insp_rec_part_rev', 'inspection_records', 'part_revisions',
                          ['part_revision_id'], ['id'])

    # เอา server_default ออกให้ schema สะอาด (NOT NULL ยังอยู่)
    op.alter_column('inspection_records', 'is_fair', server_default=None)

    # --- PartRevision: pointers/cache ไปยัง FAIR ---
    op.add_column('part_revisions', sa.Column('fair_record_id', sa.Integer(), nullable=True))
    op.add_column('part_revisions', sa.Column('fair_no_cache', sa.String(), nullable=True))
    op.add_column('part_revisions', sa.Column('fair_date_cache', sa.Date(), nullable=True))
    op.create_unique_constraint('uq_part_revisions_fair_record_id', 'part_revisions', ['fair_record_id'])
    op.create_foreign_key('fk_part_rev_fair_record', 'part_revisions', 'inspection_records',
                          ['fair_record_id'], ['id'], ondelete='SET NULL')

    # --- ProductionLot: flag + pointer ไปยัง FAIR ---
    op.add_column(
        'production_lots',
        sa.Column('fair_required', sa.Boolean(), nullable=False, server_default=sa.text('false'))
    )
    op.add_column('production_lots', sa.Column('fair_record_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_production_lots_fair_record_id'), 'production_lots',
                    ['fair_record_id'], unique=False)
    op.create_foreign_key('fk_prod_lot_fair_record', 'production_lots', 'inspection_records',
                          ['fair_record_id'], ['id'], ondelete='SET NULL')

    # เอา server_default ออกให้ schema สะอาด
    op.alter_column('production_lots', 'fair_required', server_default=None)

    # ✅ หมายเหตุ: ถ้าคุณต้องการคงคอลัมน์ po_line_id ไว้
    # ห้ามมีคำสั่ง drop po_line_id / drop FK / drop index ที่ autogenerate เคยใส่มา

def downgrade() -> None:
    # --- ProductionLot ---
    # (ย้อนกลับของ FAIR fields)
    op.drop_constraint('fk_prod_lot_fair_record', 'production_lots', type_='foreignkey')
    op.drop_index(op.f('ix_production_lots_fair_record_id'), table_name='production_lots')
    op.drop_column('production_lots', 'fair_record_id')
    op.drop_column('production_lots', 'fair_required')

    # *** ถ้าในระบบคุณมี po_line_id เดิมอยู่ ก็ไม่ต้องยุ่งกับมันใน downgrade เช่นกัน ***
    # (อย่าเพิ่มหรือลบ po_line_id ที่นี่)

    # --- PartRevision ---
    op.drop_constraint('fk_part_rev_fair_record', 'part_revisions', type_='foreignkey')
    op.drop_constraint('uq_part_revisions_fair_record_id', 'part_revisions', type_='unique')
    op.drop_column('part_revisions', 'fair_date_cache')
    op.drop_column('part_revisions', 'fair_no_cache')
    op.drop_column('part_revisions', 'fair_record_id')

    # --- InspectionRecord ---
    op.drop_constraint('fk_insp_rec_part_rev', 'inspection_records', type_='foreignkey')
    op.drop_index(op.f('ix_inspection_records_part_revision_id'), table_name='inspection_records')
    op.drop_index('ix_inspection_records_fair_rev', table_name='inspection_records')
    op.drop_column('inspection_records', 'part_revision_id')
    op.drop_column('inspection_records', 'fair_date')
    op.drop_column('inspection_records', 'fair_doc_file')
    op.drop_column('inspection_records', 'fair_no')
    op.drop_column('inspection_records', 'is_fair')
