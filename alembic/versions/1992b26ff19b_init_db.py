"""init db

Revision ID: 1992b26ff19b
Revises: 
Create Date: 2025-10-03 20:09:27.968050

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1992b26ff19b'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # =========== Master ===========
    op.create_table(
        'suppliers',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('code', sa.String, nullable=False, unique=True, index=True),
        sa.Column('name', sa.String, nullable=False),
        sa.Column('contact', sa.String),
        sa.Column('email', sa.String),
        sa.Column('phone', sa.String),
        sa.Column('address', sa.String),
        sa.Column('payment_terms', sa.String),
    )

    op.create_table(
        'customers',
        sa.Column('id', sa.Integer, primary_key=True, index=True),
        sa.Column('code', sa.String, nullable=False, unique=True, index=True),
        sa.Column('name', sa.String, nullable=False),
        sa.Column('contact', sa.String),
        sa.Column('email', sa.String),
        sa.Column('phone', sa.String),
        sa.Column('address', sa.String),
    )

    op.create_table(
        'employees',
        sa.Column('id', sa.Integer, primary_key=True, index=True),
        sa.Column('emp_code', sa.String, nullable=False, unique=True, index=True),
        sa.Column('name', sa.String, nullable=False),
        sa.Column('position', sa.String),
        sa.Column('department', sa.String),
        sa.Column('email', sa.String),
        sa.Column('phone', sa.String),
        sa.Column('status', sa.String, nullable=False, server_default='active'),
    )

    # =========== Materials =========
    op.create_table(
        'raw_materials',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('code', sa.String, nullable=False, unique=True, index=True),
        sa.Column('name', sa.String, nullable=False),
        sa.Column('spec', sa.String),
        sa.Column('uom', sa.String, nullable=False, server_default='kg'),
        sa.Column('remark', sa.Text),
    )

    op.create_table(
        'material_pos',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('po_number', sa.String, nullable=False, unique=True, index=True),
        sa.Column('supplier_id', sa.Integer, sa.ForeignKey('suppliers.id'), nullable=False, index=True),
        sa.Column('order_date', sa.Date, nullable=False, server_default=sa.text('CURRENT_DATE')),
        sa.Column('status', sa.String, nullable=False, server_default='open'),
        sa.Column('notes', sa.Text),
    )

    op.create_table(
        'material_po_lines',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('po_id', sa.Integer, sa.ForeignKey('material_pos.id'), nullable=False, index=True),
        sa.Column('material_id', sa.Integer, sa.ForeignKey('raw_materials.id'), nullable=False, index=True),
        sa.Column('qty_ordered', sa.Numeric(18, 3), nullable=False),
        sa.Column('unit_price', sa.Numeric(18, 2)),
        sa.Column('due_date', sa.Date),
    )

    op.create_table(
        'raw_batches',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('material_id', sa.Integer, sa.ForeignKey('raw_materials.id'), nullable=False, index=True),
        sa.Column('supplier_id', sa.Integer, sa.ForeignKey('suppliers.id'), index=True),
        sa.Column('material_po_line_id', sa.Integer, sa.ForeignKey('material_po_lines.id'), index=True),
        sa.Column('po_id', sa.Integer, sa.ForeignKey('material_pos.id'), index=True),
        sa.Column('batch_no', sa.String, nullable=False, index=True),
        sa.Column('supplier_batch_no', sa.String),
        sa.Column('mill_name', sa.String),
        sa.Column('mill_heat_no', sa.String),
        sa.Column('received_at', sa.Date),
        sa.Column('qty_received', sa.Numeric(18, 3), nullable=False, server_default='0'),
        sa.Column('cert_file', sa.String),
        sa.Column('location', sa.String),
        sa.UniqueConstraint('material_id', 'batch_no', 'supplier_id', name='uq_batch_material_supplier'),
    )
    op.create_index('ix_raw_batches_mat_recv', 'raw_batches', ['material_id', 'received_at'])
    op.create_index('ix_raw_batches_supplier', 'raw_batches', ['supplier_id'])
    op.create_index('ix_raw_batches_po', 'raw_batches', ['po_id'])

    # =========== Part / Rev =========
    op.create_table(
        'parts',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('part_no', sa.String, nullable=False, unique=True, index=True),
        sa.Column('name', sa.String),
        sa.Column('description', sa.Text),
        sa.Column('default_uom', sa.String, server_default='ea'),
        sa.Column('status', sa.String, server_default='active'),
    )

    op.create_table(
        'part_revisions',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('part_id', sa.Integer, sa.ForeignKey('parts.id'), nullable=False, index=True),
        sa.Column('rev', sa.String, nullable=False),
        sa.Column('drawing_file', sa.String),
        sa.Column('spec', sa.String),
        sa.Column('is_current', sa.Boolean, nullable=False, server_default=sa.text('false')),
        # fair_record_id สร้างคอลัมน์ไว้ก่อน (FK จะ add ทีหลัง เพราะ inspection_records จะมาทีหลัง)
        sa.Column('fair_record_id', sa.Integer, nullable=True, unique=True, index=True),
        sa.Column('fair_no_cache', sa.String),
        sa.Column('fair_date_cache', sa.Date),
        sa.UniqueConstraint('part_id', 'rev', name='uq_part_rev'),
        sa.UniqueConstraint('part_id', 'id', name='uq_part_id_id'),
    )
    op.create_index('ix_part_revisions_part_rev', 'part_revisions', ['part_id', 'rev'])

    op.create_table(
        'part_materials',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('part_id', sa.Integer, sa.ForeignKey('parts.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('part_revision_id', sa.Integer, sa.ForeignKey('part_revisions.id', ondelete='CASCADE'), index=True),
        sa.Column('raw_material_id', sa.Integer, sa.ForeignKey('raw_materials.id', ondelete='RESTRICT'), nullable=False, index=True),
        sa.Column('qty_per', sa.Numeric(18, 3)),
        sa.Column('uom', sa.String),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.UniqueConstraint('part_id', 'part_revision_id', 'raw_material_id', name='uq_part_rev_material_once'),
    )

    # =========== Purchase Orders =========
    op.create_table(
        'purchase_orders',
        sa.Column('id', sa.Integer, primary_key=True, index=True),
        sa.Column('po_number', sa.String, nullable=False, unique=True, index=True),
        sa.Column('description', sa.String),
        sa.Column('customer_id', sa.Integer, sa.ForeignKey('customers.id'), nullable=False, index=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )

    op.create_table(
        'po_lines',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('po_id', sa.Integer, sa.ForeignKey('purchase_orders.id'), nullable=False, index=True),
        sa.Column('part_id', sa.Integer, sa.ForeignKey('parts.id'), nullable=False, index=True),
        sa.Column('revision_id', sa.Integer, index=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('qty_ordered', sa.Numeric(18, 3), nullable=False),
        sa.Column('unit_price', sa.Numeric(18, 2)),
        sa.Column('due_date', sa.DateTime(timezone=True)),
        sa.Column('second_due_date', sa.DateTime(timezone=True)),
        sa.Column('notes', sa.Text),
    )
    op.create_index('ix_po_lines_po', 'po_lines', ['po_id'])
    op.create_index('ix_po_lines_part_rev', 'po_lines', ['part_id', 'revision_id'])
    # composite FK (part_id, revision_id) -> (part_revisions.part_id, part_revisions.id)
    op.create_foreign_key(
        'fk_poline_part_rev_pair',
        'po_lines', 'part_revisions',
        ['part_id', 'revision_id'], ['part_id', 'id'],
    )

    # =========== Production / Lot =========
    op.create_table(
        'production_lots',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('lot_no', sa.String, nullable=False, unique=True, index=True),
        sa.Column('part_id', sa.Integer, sa.ForeignKey('parts.id'), nullable=False, index=True),
        sa.Column('part_revision_id', sa.Integer, sa.ForeignKey('part_revisions.id'), index=True),
        sa.Column('po_id', sa.Integer, sa.ForeignKey('purchase_orders.id'), index=True),
        sa.Column('po_line_id', sa.Integer, sa.ForeignKey('po_lines.id'), index=True),
        sa.Column('planned_qty', sa.Integer, nullable=False, server_default='0'),
        sa.Column('started_at', sa.DateTime(timezone=True)),
        sa.Column('finished_at', sa.DateTime(timezone=True)),
        sa.Column('lot_due_date', sa.Date, index=True),
        sa.Column('status', sa.String, nullable=False, server_default='in_process'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('fair_required', sa.Boolean, nullable=False, server_default=sa.text('false')),
        # fair_record_id ใส่คอลัมน์ไว้ก่อน ค่อย add FK หลัง inspection_records ถูกสร้าง
        sa.Column('fair_record_id', sa.Integer, index=True),
    )
    op.create_index('ix_lots_no', 'production_lots', ['lot_no'])
    op.create_index('ix_lots_status', 'production_lots', ['status'])
    op.create_index('ix_lots_part', 'production_lots', ['part_id', 'part_revision_id'])

    op.create_table(
        'shop_travelers',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('traveler_no', sa.String, unique=True, index=True),
        sa.Column('lot_id', sa.Integer, sa.ForeignKey('production_lots.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('created_by_id', sa.Integer, sa.ForeignKey('employees.id')),
        sa.Column('status', sa.String, nullable=False, server_default='open'),
        sa.Column('notes', sa.Text),
        sa.Column('production_due_date', sa.Date, index=True),
    )
    op.create_index('ix_shop_travelers_status', 'shop_travelers', ['status'])

    op.create_table(
        'machines',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('code', sa.String, nullable=False, unique=True, index=True),
        sa.Column('name', sa.String, nullable=False),
        sa.Column('type', sa.String),
        sa.Column('controller', sa.String),
        sa.Column('axis_count', sa.Integer),
        sa.Column('spindle_power_kw', sa.Numeric(10, 3)),
        sa.Column('max_travel_x', sa.Numeric(10, 3)),
        sa.Column('max_travel_y', sa.Numeric(10, 3)),
        sa.Column('max_travel_z', sa.Numeric(10, 3)),
        sa.Column('location', sa.String),
        sa.Column('status', sa.String, nullable=False, server_default='available'),
        sa.Column('notes', sa.Text),
    )
    op.create_index('ix_machines_status', 'machines', ['status'])
    op.create_index('ix_machines_type_status', 'machines', ['type', 'status'])

    op.create_table(
        'shop_traveler_steps',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('traveler_id', sa.Integer, sa.ForeignKey('shop_travelers.id'), nullable=False, index=True),
        sa.Column('seq', sa.Integer, nullable=False),
        sa.Column('step_code', sa.String),
        sa.Column('step_name', sa.String, nullable=False),
        sa.Column('station', sa.String),
        sa.Column('status', sa.String, nullable=False, server_default='pending'),
        sa.Column('started_at', sa.DateTime(timezone=True)),
        sa.Column('finished_at', sa.DateTime(timezone=True)),
        sa.Column('operator_id', sa.Integer, sa.ForeignKey('employees.id'), index=True),
        sa.Column('machine_id', sa.Integer, sa.ForeignKey('machines.id'), index=True),
        sa.Column('qa_required', sa.Boolean, nullable=False, server_default=sa.text('false')),
        sa.Column('qa_result', sa.String),
        sa.Column('qa_notes', sa.Text),
        sa.Column('qty_receive', sa.Numeric(18, 3), nullable=False, server_default='0'),
        sa.Column('qty_accept', sa.Numeric(18, 3), nullable=False, server_default='0'),
        sa.Column('qty_reject', sa.Numeric(18, 3), nullable=False, server_default='0'),
        sa.UniqueConstraint('traveler_id', 'seq', name='uq_traveler_seq'),
    )
    op.create_index('ix_traveler_steps_status', 'shop_traveler_steps', ['status'])
    op.create_index('ix_traveler_steps_operator', 'shop_traveler_steps', ['operator_id'])
    op.create_index('ix_traveler_steps_machine', 'shop_traveler_steps', ['machine_id'])

    # =========== QA / Measurement =========
    op.create_table(
        'measurement_devices',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('code', sa.String, nullable=False, unique=True, index=True),
        sa.Column('name', sa.String, nullable=False),
        sa.Column('type', sa.String),
        sa.Column('brand', sa.String),
        sa.Column('model', sa.String),
        sa.Column('serial_no', sa.String),
        sa.Column('location', sa.String),
        sa.Column('status', sa.String, nullable=False, server_default='available'),
        sa.Column('calibration_due', sa.Date),
        sa.Column('notes', sa.Text),
    )
    op.create_index('ix_measurement_devices_status', 'measurement_devices', ['status'])
    op.create_index('ix_measurement_devices_type', 'measurement_devices', ['type'])
    op.create_index('ix_measurement_devices_cal_due', 'measurement_devices', ['calibration_due'])

    op.create_table(
        'device_calibrations',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('device_id', sa.Integer, sa.ForeignKey('measurement_devices.id'), nullable=False, index=True),
        sa.Column('calibrated_at', sa.Date, nullable=False),
        sa.Column('due_at', sa.Date),
        sa.Column('performed_by', sa.String),
        sa.Column('result', sa.String),
        sa.Column('certificate_file', sa.String),
    )
    op.create_index('ix_device_calibrations_device', 'device_calibrations', ['device_id', 'calibrated_at'])

    # inspection_records ต้องการ shop_traveler_steps แล้ว (พร้อม)
    op.create_table(
        'inspection_records',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('traveler_step_id', sa.Integer, sa.ForeignKey('shop_traveler_steps.id'), nullable=False, index=True),
        sa.Column('is_fair', sa.Boolean, nullable=False, server_default=sa.text('false')),
        sa.Column('fair_no', sa.String),
        sa.Column('fair_doc_file', sa.String),
        sa.Column('fair_date', sa.Date),
        sa.Column('part_revision_id', sa.Integer, index=True),  # จะ add FK ทีหลัง (เนื่องจาก part_revisions มีคอลัมน์ชี้กลับ)
        sa.Column('inspector_id', sa.Integer, sa.ForeignKey('employees.id'), index=True),
        sa.Column('device_id', sa.Integer, sa.ForeignKey('measurement_devices.id'), index=True),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('finished_at', sa.DateTime(timezone=True)),
        sa.Column('overall_result', sa.String),
        sa.Column('notes', sa.Text),
    )
    op.create_index('ix_inspection_records_result', 'inspection_records', ['overall_result'])
    op.create_index('ix_inspection_records_fair_rev', 'inspection_records', ['part_revision_id', 'is_fair'])

    op.create_table(
        'inspection_items',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('record_id', sa.Integer, sa.ForeignKey('inspection_records.id'), nullable=False, index=True),
        sa.Column('characteristic', sa.String, nullable=False),
        sa.Column('nominal_value', sa.Numeric(18, 4)),
        sa.Column('tol_lower', sa.Numeric(18, 4)),
        sa.Column('tol_upper', sa.Numeric(18, 4)),
        sa.Column('measured_value', sa.Numeric(18, 4)),
        sa.Column('unit', sa.String),
        sa.Column('result', sa.String),
        sa.Column('device_id', sa.Integer, sa.ForeignKey('measurement_devices.id'), index=True),
        sa.Column('attachment', sa.String),
    )
    op.create_index('ix_inspection_items_record', 'inspection_items', ['record_id'])
    op.create_index('ix_inspection_items_result', 'inspection_items', ['result'])

    # ตอนนี้เราค่อยเติม FK ข้ามกันที่ค้างอยู่ (แก้วงจร):
    # part_revisions.fair_record_id -> inspection_records.id
    op.create_foreign_key(
        'fk_partrev_fair_record',
        'part_revisions', 'inspection_records',
        ['fair_record_id'], ['id'],
        ondelete='SET NULL'
    )
    # inspection_records.part_revision_id -> part_revisions.id
    op.create_foreign_key(
        'fk_insprec_partrev',
        'inspection_records', 'part_revisions',
        ['part_revision_id'], ['id'],
        ondelete='SET NULL'
    )
    # production_lots.fair_record_id -> inspection_records.id
    op.create_foreign_key(
        'fk_lot_fair_record',
        'production_lots', 'inspection_records',
        ['fair_record_id'], ['id'],
        ondelete='SET NULL'
    )

    # =========== Lot Material Use =========
    op.create_table(
        'lot_material_use',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('lot_id', sa.Integer, sa.ForeignKey('production_lots.id'), nullable=False, index=True),
        sa.Column('batch_id', sa.Integer, sa.ForeignKey('raw_batches.id'), nullable=False, index=True),
        sa.Column('raw_material_id', sa.Integer, sa.ForeignKey('raw_materials.id'), nullable=False, index=True),
        sa.Column('qty', sa.Numeric(18, 3), nullable=False),
        sa.Column('uom', sa.String),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('used_by_id', sa.Integer, sa.ForeignKey('employees.id')),
        sa.Column('note', sa.Text),
    )
    op.create_index('ix_lmu_lot', 'lot_material_use', ['lot_id'])
    op.create_index('ix_lmu_batch', 'lot_material_use', ['batch_id'])
    op.create_index('ix_lmu_rm', 'lot_material_use', ['raw_material_id'])

    # =========== Subcontracting =========
    op.create_table(
        'subcon_orders',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('supplier_id', sa.Integer, sa.ForeignKey('suppliers.id'), nullable=False, index=True),
        sa.Column('ref_no', sa.String),
        sa.Column('status', sa.String, nullable=False, server_default='open'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('due_date', sa.Date),
        sa.Column('notes', sa.Text),
    )
    op.create_index('ix_subcon_orders_supplier_status', 'subcon_orders', ['supplier_id', 'status'])

    op.create_table(
        'subcon_order_lines',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('order_id', sa.Integer, sa.ForeignKey('subcon_orders.id'), nullable=False, index=True),
        sa.Column('traveler_step_id', sa.Integer, sa.ForeignKey('shop_traveler_steps.id'), nullable=False, index=True),
        sa.Column('qty_planned', sa.Numeric(18, 3), nullable=False, server_default='0'),
        sa.Column('unit_cost', sa.Numeric(18, 2)),
        sa.UniqueConstraint('order_id', 'traveler_step_id', name='uq_order_step'),
    )
    op.create_index('ix_subcon_order_lines_step', 'subcon_order_lines', ['traveler_step_id'])

    op.create_table(
        'subcon_shipments',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('order_id', sa.Integer, sa.ForeignKey('subcon_orders.id'), nullable=False, index=True),
        sa.Column('shipped_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('shipped_by', sa.String),
        sa.Column('package_no', sa.String),
        sa.Column('carrier', sa.String),
        sa.Column('tracking_no', sa.String),
        sa.Column('status', sa.String, nullable=False, server_default='shipped'),
    )

    op.create_table(
        'subcon_shipment_items',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('shipment_id', sa.Integer, sa.ForeignKey('subcon_shipments.id'), nullable=False, index=True),
        sa.Column('traveler_step_id', sa.Integer, sa.ForeignKey('shop_traveler_steps.id'), nullable=False, index=True),
        sa.Column('qty', sa.Numeric(18, 3), nullable=False, server_default='0'),
    )
    op.create_index('ix_subcon_shipment_items_step', 'subcon_shipment_items', ['traveler_step_id'])

    op.create_table(
        'subcon_receipts',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('order_id', sa.Integer, sa.ForeignKey('subcon_orders.id'), nullable=False, index=True),
        sa.Column('received_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('received_by', sa.String),
        sa.Column('doc_no', sa.String),
        sa.Column('status', sa.String, nullable=False, server_default='received'),
    )

    op.create_table(
        'subcon_receipt_items',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('receipt_id', sa.Integer, sa.ForeignKey('subcon_receipts.id'), nullable=False, index=True),
        sa.Column('traveler_step_id', sa.Integer, sa.ForeignKey('shop_traveler_steps.id'), nullable=False, index=True),
        sa.Column('qty_received', sa.Numeric(18, 3), nullable=False, server_default='0'),
        sa.Column('qty_rejected', sa.Numeric(18, 3), nullable=False, server_default='0'),
        sa.Column('scrap_qty', sa.Numeric(18, 3), nullable=False, server_default='0'),
        sa.Column('qa_result', sa.String),
        sa.Column('qa_notes', sa.Text),
    )
    op.create_index('ix_subcon_receipt_items_step', 'subcon_receipt_items', ['traveler_step_id'])

    # =========== Auth / RBAC =========
    op.create_table(
        'roles',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('code', sa.String, nullable=False, unique=True, index=True),
        sa.Column('name', sa.String, nullable=False),
        sa.Column('description', sa.Text),
    )

    op.create_table(
        'permissions',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('code', sa.String, nullable=False, unique=True, index=True),
        sa.Column('name', sa.String, nullable=False),
        sa.Column('description', sa.Text),
    )

    op.create_table(
        'users',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('username', sa.String, nullable=False, unique=True, index=True),
        sa.Column('email', sa.String, unique=True, index=True),
        sa.Column('password_hash', sa.String, nullable=False),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default=sa.text('true')),
        sa.Column('is_superuser', sa.Boolean, nullable=False, server_default=sa.text('false')),
        sa.Column('employee_id', sa.Integer, sa.ForeignKey('employees.id', ondelete='SET NULL'), unique=True, index=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('last_login_at', sa.DateTime(timezone=True)),
    )
    op.create_index('ix_users_active', 'users', ['is_active'])

    op.create_table(
        'user_roles',
        sa.Column('user_id', sa.Integer, sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True, nullable=False),
        sa.Column('role_id', sa.Integer, sa.ForeignKey('roles.id', ondelete='CASCADE'), primary_key=True, nullable=False),
        sa.Column('assigned_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )

    op.create_table(
        'role_permissions',
        sa.Column('role_id', sa.Integer, sa.ForeignKey('roles.id'), primary_key=True),
        sa.Column('permission_id', sa.Integer, sa.ForeignKey('permissions.id'), primary_key=True),
    )

    # =========== Time Tracking =========
    op.create_table(
        'pay_periods',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('name', sa.String),
        sa.Column('start_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('end_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('status', sa.String, nullable=False, server_default='open'),
        sa.Column('anchor', sa.String),
        sa.Column('notes', sa.Text),
        sa.Column('created_by', sa.Integer, sa.ForeignKey('users.id')),
        sa.Column('locked_by', sa.Integer, sa.ForeignKey('users.id')),
        sa.Column('locked_at', sa.DateTime(timezone=True)),
        sa.Column('paid_at', sa.DateTime(timezone=True)),
        sa.Column('created_by_emp_id', sa.Integer, sa.ForeignKey('employees.id')),
        sa.Column('locked_by_emp_id', sa.Integer, sa.ForeignKey('employees.id')),
        sa.Column('paid_by_emp_id', sa.Integer, sa.ForeignKey('employees.id')),
        sa.UniqueConstraint('start_at', 'end_at', name='uq_pay_periods_range'),
    )
    op.create_index('ix_pay_periods_range', 'pay_periods', ['start_at', 'end_at'])

    op.create_table(
        'time_entries',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('employee_id', sa.Integer, sa.ForeignKey('employees.id'), nullable=False, index=True),
        sa.Column('payroll_emp_id', sa.Integer, sa.ForeignKey('employees.id', ondelete='SET NULL'), index=True),
        sa.Column('created_by_user_id', sa.Integer, sa.ForeignKey('users.id'), index=True),
        sa.Column('work_user_id', sa.Integer, sa.ForeignKey('users.id'), index=True),
        sa.Column('clock_in_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('clock_in_method', sa.String),
        sa.Column('clock_in_location', sa.String),
        sa.Column('clock_out_at', sa.DateTime(timezone=True)),
        sa.Column('clock_out_method', sa.String),
        sa.Column('clock_out_location', sa.String),
        sa.Column('status', sa.String, nullable=False, server_default='open'),
        sa.Column('notes', sa.Text),
        sa.Column('pay_period_id', sa.Integer, sa.ForeignKey('pay_periods.id'), index=True),
    )
    op.create_index('ix_time_entries_emp_status', 'time_entries', ['employee_id', 'status'])
    op.create_index('ix_time_entries_in', 'time_entries', ['clock_in_at'])
    op.create_index('ix_time_entries_out', 'time_entries', ['clock_out_at'])
    op.create_index('ix_time_entries_work_user', 'time_entries', ['work_user_id'])
    op.create_index('ix_time_entries_emp_work_week', 'time_entries', ['employee_id', 'work_user_id', 'clock_in_at'])
    op.create_index('ix_time_entries_payroll_emp', 'time_entries', ['payroll_emp_id'])

    op.create_table(
        'break_entries',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('time_entry_id', sa.Integer, sa.ForeignKey('time_entries.id'), nullable=False, index=True),
        sa.Column('break_type', sa.String, nullable=False, server_default='lunch'),
        sa.Column('start_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('end_at', sa.DateTime(timezone=True)),
        sa.Column('method', sa.String),
        sa.Column('location', sa.String),
        sa.Column('notes', sa.Text),
        sa.Column('is_paid', sa.Boolean, nullable=False, server_default=sa.text('false')),
    )
    op.create_index('ix_break_entries_parent', 'break_entries', ['time_entry_id'])
    op.create_index('ix_break_entries_start', 'break_entries', ['start_at'])
    op.create_index('ix_break_entries_end', 'break_entries', ['end_at'])

    op.create_table(
        'time_leaves',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('employee_id', sa.Integer, sa.ForeignKey('employees.id'), nullable=False, index=True),
        sa.Column('leave_type', sa.String, nullable=False),
        sa.Column('start_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('end_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('hours', sa.Numeric(5, 2)),
        sa.Column('is_paid', sa.Boolean, nullable=False, server_default=sa.text('true')),
        sa.Column('status', sa.String, nullable=False, server_default='approved'),
        sa.Column('notes', sa.Text),
    )
    op.create_index('ix_time_leaves_emp_date', 'time_leaves', ['employee_id', 'start_at', 'end_at'])

    op.create_table(
        'holidays',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('holiday_date', sa.Date, nullable=False, unique=True),
        sa.Column('name', sa.String, nullable=False),
        sa.Column('is_paid', sa.Boolean, nullable=False, server_default=sa.text('true')),
        sa.Column('hours', sa.Numeric(4, 2)),
        sa.Column('pay_multiplier', sa.Numeric(3, 2), nullable=False, server_default='1'),
    )

    op.create_table(
        'pay_rates',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('employee_id', sa.Integer, sa.ForeignKey('employees.id'), nullable=False, index=True),
        sa.Column('effective_from', sa.DateTime(timezone=True), nullable=False),
        sa.Column('hourly_rate', sa.Numeric(8, 2), nullable=False),
        sa.Column('ot_multiplier', sa.Numeric(4, 2), nullable=False, server_default='1.5'),
        sa.Column('dt_multiplier', sa.Numeric(4, 2), nullable=False, server_default='2.0'),
        sa.UniqueConstraint('employee_id', 'effective_from', name='uq_pay_rates_emp_eff'),
    )
    op.create_index('ix_pay_rates_emp_eff', 'pay_rates', ['employee_id', 'effective_from'])

    # =========== Customer Shipment / Invoice / Return =========
    op.create_table(
        'customer_shipments',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('po_id', sa.Integer, sa.ForeignKey('purchase_orders.id'), nullable=False, index=True),
        sa.Column('shipped_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('ship_to', sa.String),
        sa.Column('carrier', sa.String),
        sa.Column('tracking_no', sa.String),
        sa.Column('notes', sa.Text),
    )

    op.create_table(
        'customer_shipment_items',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('shipment_id', sa.Integer, sa.ForeignKey('customer_shipments.id'), nullable=False, index=True),
        sa.Column('po_line_id', sa.Integer, sa.ForeignKey('po_lines.id'), nullable=False, index=True),
        sa.Column('lot_id', sa.Integer, sa.ForeignKey('production_lots.id'), index=True),
        sa.Column('qty', sa.Numeric(18, 3), nullable=False),
    )

    op.create_table(
        'customer_invoices',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('invoice_no', sa.String, nullable=False, unique=True, index=True),
        sa.Column('po_id', sa.Integer, sa.ForeignKey('purchase_orders.id'), nullable=False, index=True),
        sa.Column('invoice_date', sa.Date, nullable=False, server_default=sa.text('CURRENT_DATE')),
        sa.Column('status', sa.String, nullable=False, server_default='open'),
        sa.Column('notes', sa.Text),
    )

    op.create_table(
        'customer_invoice_lines',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('invoice_id', sa.Integer, sa.ForeignKey('customer_invoices.id'), nullable=False, index=True),
        sa.Column('po_line_id', sa.Integer, sa.ForeignKey('po_lines.id'), nullable=False, index=True),
        sa.Column('shipment_item_id', sa.Integer, sa.ForeignKey('customer_shipment_items.id'), index=True),
        sa.Column('qty', sa.Numeric(18, 3), nullable=False),
        sa.Column('unit_price', sa.Numeric(18, 2)),
        sa.Column('amount', sa.Numeric(18, 2)),
    )

    op.create_table(
        'customer_returns',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('po_id', sa.Integer, sa.ForeignKey('purchase_orders.id'), nullable=False, index=True),
        sa.Column('rma_no', sa.String, unique=True, index=True),
        sa.Column('returned_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('reason', sa.Text),
        sa.Column('status', sa.String, nullable=False, server_default='received'),
    )

    op.create_table(
        'customer_return_items',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('return_id', sa.Integer, sa.ForeignKey('customer_returns.id'), nullable=False, index=True),
        sa.Column('shipment_item_id', sa.Integer, sa.ForeignKey('customer_shipment_items.id'), index=True),
        sa.Column('po_line_id', sa.Integer, sa.ForeignKey('po_lines.id'), nullable=False, index=True),
        sa.Column('lot_id', sa.Integer, sa.ForeignKey('production_lots.id'), index=True),
        sa.Column('qty', sa.Numeric(18, 3), nullable=False),
        sa.Column('reason_code', sa.String),
        sa.Column('disposition', sa.String),
    )

    # =========== Selections =========
    op.create_table(
        'mfg_processes',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('code', sa.String, nullable=False, unique=True, index=True),
        sa.Column('name', sa.String, nullable=False),
        sa.Column('category', sa.String),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default=sa.text('true')),
    )

    op.create_table(
        'chemical_finishes',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('code', sa.String, nullable=False, unique=True, index=True),
        sa.Column('name', sa.String, nullable=False),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default=sa.text('true')),
    )

    op.create_table(
        'part_process_selections',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('part_id', sa.Integer, sa.ForeignKey('parts.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('process_id', sa.Integer, sa.ForeignKey('mfg_processes.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.UniqueConstraint('part_id', 'process_id', name='uq_part_process'),
    )

    op.create_table(
        'part_finish_selections',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('part_id', sa.Integer, sa.ForeignKey('parts.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('finish_id', sa.Integer, sa.ForeignKey('chemical_finishes.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.UniqueConstraint('part_id', 'finish_id', name='uq_part_finish'),
    )

    op.create_table(
        'part_other_notes',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('part_id', sa.Integer, sa.ForeignKey('parts.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('category', sa.String, nullable=False),
        sa.Column('note', sa.String, nullable=False),
    )


def downgrade() -> None:
    # ลบตามลำดับย้อนกลับ (ปลอดภัยกับ FK)
    for tbl in [
        'part_other_notes',
        'part_finish_selections',
        'part_process_selections',
        'chemical_finishes',
        'mfg_processes',
        'customer_return_items',
        'customer_returns',
        'customer_invoice_lines',
        'customer_invoices',
        'customer_shipment_items',
        'customer_shipments',
        'pay_rates',
        'holidays',
        'time_leaves',
        'break_entries',
        'time_entries',
        'pay_periods',
        'role_permissions',
        'user_roles',
        'users',
        'permissions',
        'roles',
        'subcon_receipt_items',
        'subcon_receipts',
        'subcon_shipment_items',
        'subcon_shipments',
        'subcon_order_lines',
        'subcon_orders',
        'lot_material_use',
        'inspection_items',
        'inspection_records',
        'device_calibrations',
        'measurement_devices',
        'shop_traveler_steps',
        'machines',
        'shop_travelers',
        'production_lots',
        'po_lines',
        'purchase_orders',
        'part_materials',
        'part_revisions',
        'parts',
        'raw_batches',
        'material_po_lines',
        'material_pos',
        'raw_materials',
        'employees',
        'customers',
        'suppliers',
    ]:
        op.drop_table(tbl)
