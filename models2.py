from typing import List, Optional

from sqlalchemy import BigInteger, Boolean, CheckConstraint, Date, DateTime, ForeignKeyConstraint, Index, Integer, Numeric, PrimaryKeyConstraint, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
import datetime
import decimal

class Base(DeclarativeBase):
    pass


class Attachments(Base):
    __tablename__ = 'attachments'
    __table_args__ = (
        PrimaryKeyConstraint('id', name='attachments_pkey'),
        Index('idx_attach_entity', 'entity_type', 'entity_id')
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    entity_type: Mapped[str] = mapped_column(Text)
    entity_id: Mapped[int] = mapped_column(BigInteger)
    file_name: Mapped[Optional[str]] = mapped_column(Text)
    file_url: Mapped[Optional[str]] = mapped_column(Text)
    uploaded_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True), server_default=text('now()'))
    extras: Mapped[Optional[dict]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))


class Customers(Base):
    __tablename__ = 'customers'
    __table_args__ = (
        CheckConstraint("type = ANY (ARRAY['company'::text, 'individual'::text, 'organization'::text])", name='customers_type_check'),
        PrimaryKeyConstraint('id', name='customers_pkey'),
        UniqueConstraint('customer_code', name='customers_customer_code_key'),
        Index('idx_customers_code', 'customer_code'),
        Index('idx_customers_name', 'name')
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    customer_code: Mapped[str] = mapped_column(Text)
    name: Mapped[str] = mapped_column(Text)
    type: Mapped[Optional[str]] = mapped_column(Text)
    phone: Mapped[Optional[str]] = mapped_column(Text)
    email: Mapped[Optional[str]] = mapped_column(Text)
    website: Mapped[Optional[str]] = mapped_column(Text)
    billing_address: Mapped[Optional[str]] = mapped_column(Text)
    shipping_address: Mapped[Optional[str]] = mapped_column(Text)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    extras: Mapped[Optional[dict]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    created_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True), server_default=text('now()'))
    updated_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True), server_default=text('now()'))

    customer_addresses: Mapped[List['CustomerAddresses']] = relationship('CustomerAddresses', back_populates='customer')
    customer_contacts: Mapped[List['CustomerContacts']] = relationship('CustomerContacts', back_populates='customer')
    pos: Mapped[List['Pos']] = relationship('Pos', back_populates='customer')
    workflow_templates: Mapped[List['WorkflowTemplates']] = relationship('WorkflowTemplates', back_populates='customer')


class Employees(Base):
    __tablename__ = 'employees'
    __table_args__ = (
        CheckConstraint("status = ANY (ARRAY['active'::text, 'inactive'::text, 'on_leave'::text])", name='employees_status_check'),
        PrimaryKeyConstraint('id', name='employees_pkey'),
        UniqueConstraint('email', name='employees_email_key'),
        UniqueConstraint('employee_code', name='employees_employee_code_key'),
        Index('idx_employees_name', 'last_name', 'first_name')
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    first_name: Mapped[str] = mapped_column(Text)
    last_name: Mapped[str] = mapped_column(Text)
    employee_code: Mapped[Optional[str]] = mapped_column(Text)
    position: Mapped[Optional[str]] = mapped_column(Text)
    department: Mapped[Optional[str]] = mapped_column(Text)
    phone: Mapped[Optional[str]] = mapped_column(Text)
    email: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[Optional[str]] = mapped_column(Text, server_default=text("'active'::text"))
    hired_at: Mapped[Optional[datetime.date]] = mapped_column(Date)
    extras: Mapped[Optional[dict]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    created_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True), server_default=text('now()'))
    updated_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True), server_default=text('now()'))

    workflow_step_instances: Mapped[List['WorkflowStepInstances']] = relationship('WorkflowStepInstances', back_populates='assignee_employee')
    qa_inspections: Mapped[List['QaInspections']] = relationship('QaInspections', back_populates='inspector_employee')


class Materials(Base):
    __tablename__ = 'materials'
    __table_args__ = (
        PrimaryKeyConstraint('id', name='materials_pkey'),
        UniqueConstraint('material_code', name='materials_material_code_key'),
        Index('idx_mat_code', 'material_code')
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    material_code: Mapped[str] = mapped_column(Text)
    name: Mapped[str] = mapped_column(Text)
    uom_base: Mapped[str] = mapped_column(Text)
    spec: Mapped[Optional[str]] = mapped_column(Text)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    extras: Mapped[Optional[dict]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))

    material_batches: Mapped[List['MaterialBatches']] = relationship('MaterialBatches', back_populates='material')
    part_boms: Mapped[List['PartBoms']] = relationship('PartBoms', back_populates='material')
    lot_material_requirements: Mapped[List['LotMaterialRequirements']] = relationship('LotMaterialRequirements', back_populates='material')


class Parts(Base):
    __tablename__ = 'parts'
    __table_args__ = (
        PrimaryKeyConstraint('id', name='parts_pkey'),
        UniqueConstraint('part_number', name='parts_part_number_key'),
        Index('idx_parts_part_number', 'part_number')
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    part_number: Mapped[str] = mapped_column(Text)
    description: Mapped[Optional[str]] = mapped_column(Text)
    fair_no: Mapped[Optional[str]] = mapped_column(Text)
    extras: Mapped[Optional[dict]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    created_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True), server_default=text('now()'))
    updated_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True), server_default=text('now()'))

    part_boms: Mapped[List['PartBoms']] = relationship('PartBoms', back_populates='part')
    workflow_templates: Mapped[List['WorkflowTemplates']] = relationship('WorkflowTemplates', back_populates='part')
    po_lines: Mapped[List['PoLines']] = relationship('PoLines', back_populates='part')


class QaTemplates(Base):
    __tablename__ = 'qa_templates'
    __table_args__ = (
        PrimaryKeyConstraint('id', name='qa_templates_pkey'),
        UniqueConstraint('name', name='qa_templates_name_key')
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    name: Mapped[Optional[str]] = mapped_column(Text)
    aql: Mapped[Optional[str]] = mapped_column(Text)
    parameters: Mapped[Optional[dict]] = mapped_column(JSONB)
    extras: Mapped[Optional[dict]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))


class CustomerAddresses(Base):
    __tablename__ = 'customer_addresses'
    __table_args__ = (
        CheckConstraint("type = ANY (ARRAY['billing'::text, 'shipping'::text, 'other'::text])", name='customer_addresses_type_check'),
        ForeignKeyConstraint(['customer_id'], ['customers.id'], ondelete='CASCADE', name='customer_addresses_customer_id_fkey'),
        PrimaryKeyConstraint('id', name='customer_addresses_pkey'),
        Index('idx_caddr_customer', 'customer_id'),
        Index('ux_caddr_default_billing', 'customer_id', unique=True),
        Index('ux_caddr_default_shipping', 'customer_id', unique=True)
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    customer_id: Mapped[int] = mapped_column(BigInteger)
    addr_line1: Mapped[str] = mapped_column(Text)
    type: Mapped[str] = mapped_column(Text)
    label: Mapped[Optional[str]] = mapped_column(Text)
    addr_line2: Mapped[Optional[str]] = mapped_column(Text)
    city: Mapped[Optional[str]] = mapped_column(Text)
    state: Mapped[Optional[str]] = mapped_column(Text)
    postal_code: Mapped[Optional[str]] = mapped_column(Text)
    country: Mapped[Optional[str]] = mapped_column(Text, server_default=text("'US'::text"))
    is_default_billing: Mapped[Optional[bool]] = mapped_column(Boolean, server_default=text('false'))
    is_default_shipping: Mapped[Optional[bool]] = mapped_column(Boolean, server_default=text('false'))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    extras: Mapped[Optional[dict]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    created_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True), server_default=text('now()'))
    updated_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True), server_default=text('now()'))

    customer: Mapped['Customers'] = relationship('Customers', back_populates='customer_addresses')


class CustomerContacts(Base):
    __tablename__ = 'customer_contacts'
    __table_args__ = (
        ForeignKeyConstraint(['customer_id'], ['customers.id'], ondelete='CASCADE', name='customer_contacts_customer_id_fkey'),
        PrimaryKeyConstraint('id', name='customer_contacts_pkey'),
        Index('idx_ccontacts_customer', 'customer_id'),
        Index('ux_ccontacts_primary', 'customer_id', unique=True)
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    customer_id: Mapped[int] = mapped_column(BigInteger)
    name: Mapped[str] = mapped_column(Text)
    role: Mapped[Optional[str]] = mapped_column(Text)
    email: Mapped[Optional[str]] = mapped_column(Text)
    phone: Mapped[Optional[str]] = mapped_column(Text)
    is_primary: Mapped[Optional[bool]] = mapped_column(Boolean, server_default=text('false'))
    notify_po: Mapped[Optional[bool]] = mapped_column(Boolean, server_default=text('true'))
    notify_qa: Mapped[Optional[bool]] = mapped_column(Boolean, server_default=text('false'))
    notify_ship: Mapped[Optional[bool]] = mapped_column(Boolean, server_default=text('true'))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    extras: Mapped[Optional[dict]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    created_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True), server_default=text('now()'))
    updated_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True), server_default=text('now()'))

    customer: Mapped['Customers'] = relationship('Customers', back_populates='customer_contacts')


class MaterialBatches(Base):
    __tablename__ = 'material_batches'
    __table_args__ = (
        ForeignKeyConstraint(['material_id'], ['materials.id'], name='material_batches_material_id_fkey'),
        PrimaryKeyConstraint('id', name='material_batches_pkey'),
        Index('idx_mat_batches_mat', 'material_id')
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    material_id: Mapped[int] = mapped_column(BigInteger)
    received_at: Mapped[datetime.date] = mapped_column(Date)
    uom: Mapped[str] = mapped_column(Text)
    batch_no: Mapped[Optional[str]] = mapped_column(Text)
    supplier: Mapped[Optional[str]] = mapped_column(Text)
    location: Mapped[Optional[str]] = mapped_column(Text)
    cost_per_unit: Mapped[Optional[decimal.Decimal]] = mapped_column(Numeric(12, 4))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    extras: Mapped[Optional[dict]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))

    material: Mapped['Materials'] = relationship('Materials', back_populates='material_batches')
    inventory_transactions: Mapped[List['InventoryTransactions']] = relationship('InventoryTransactions', back_populates='material_batch')
    lot_material_allocations: Mapped[List['LotMaterialAllocations']] = relationship('LotMaterialAllocations', back_populates='material_batch')


class PartBoms(Base):
    __tablename__ = 'part_boms'
    __table_args__ = (
        ForeignKeyConstraint(['material_id'], ['materials.id'], name='part_boms_material_id_fkey'),
        ForeignKeyConstraint(['part_id'], ['parts.id'], ondelete='CASCADE', name='part_boms_part_id_fkey'),
        PrimaryKeyConstraint('id', name='part_boms_pkey'),
        UniqueConstraint('part_id', 'material_id', name='part_boms_part_id_material_id_key')
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    part_id: Mapped[int] = mapped_column(BigInteger)
    material_id: Mapped[int] = mapped_column(BigInteger)
    qty_per_unit: Mapped[decimal.Decimal] = mapped_column(Numeric(14, 4))
    uom: Mapped[str] = mapped_column(Text)

    material: Mapped['Materials'] = relationship('Materials', back_populates='part_boms')
    part: Mapped['Parts'] = relationship('Parts', back_populates='part_boms')


class Pos(Base):
    __tablename__ = 'pos'
    __table_args__ = (
        CheckConstraint("status = ANY (ARRAY['open'::text, 'in_progress'::text, 'closed'::text])", name='pos_status_check'),
        ForeignKeyConstraint(['customer_id'], ['customers.id'], name='pos_customer_id_fkey'),
        PrimaryKeyConstraint('id', name='pos_pkey'),
        UniqueConstraint('po_number', name='pos_po_number_key'),
        Index('idx_pos_customer', 'customer_id'),
        Index('idx_pos_duedate', 'date_due')
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    po_number: Mapped[str] = mapped_column(Text)
    customer_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    status: Mapped[Optional[str]] = mapped_column(Text, server_default=text("'open'::text"))
    urgent: Mapped[Optional[bool]] = mapped_column(Boolean, server_default=text('false'))
    last_update: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))
    ship_date: Mapped[Optional[datetime.date]] = mapped_column(Date)
    date_due: Mapped[Optional[datetime.date]] = mapped_column(Date)
    start_mfg_date: Mapped[Optional[datetime.date]] = mapped_column(Date)
    shop_traveler_ref: Mapped[Optional[str]] = mapped_column(Text)
    fair_long_note: Mapped[Optional[str]] = mapped_column(Text)
    remarks: Mapped[Optional[str]] = mapped_column(Text)
    extras: Mapped[Optional[dict]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    created_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True), server_default=text('now()'))
    updated_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True), server_default=text('now()'))

    customer: Mapped[Optional['Customers']] = relationship('Customers', back_populates='pos')
    po_lines: Mapped[List['PoLines']] = relationship('PoLines', back_populates='po')


class WorkflowTemplates(Base):
    __tablename__ = 'workflow_templates'
    __table_args__ = (
        ForeignKeyConstraint(['customer_id'], ['customers.id'], name='workflow_templates_customer_id_fkey'),
        ForeignKeyConstraint(['part_id'], ['parts.id'], name='workflow_templates_part_id_fkey'),
        PrimaryKeyConstraint('id', name='workflow_templates_pkey'),
        UniqueConstraint('part_id', 'version', name='workflow_templates_part_id_version_key')
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    version: Mapped[int] = mapped_column(Integer, server_default=text('1'))
    name: Mapped[Optional[str]] = mapped_column(Text)
    customer_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    part_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    effective_from: Mapped[Optional[datetime.date]] = mapped_column(Date)
    effective_to: Mapped[Optional[datetime.date]] = mapped_column(Date)
    extras: Mapped[Optional[dict]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))

    customer: Mapped[Optional['Customers']] = relationship('Customers', back_populates='workflow_templates')
    part: Mapped[Optional['Parts']] = relationship('Parts', back_populates='workflow_templates')
    workflow_step_templates: Mapped[List['WorkflowStepTemplates']] = relationship('WorkflowStepTemplates', back_populates='workflow_template')
    workflow_instances: Mapped[List['WorkflowInstances']] = relationship('WorkflowInstances', back_populates='workflow_template')


class InventoryTransactions(Base):
    __tablename__ = 'inventory_transactions'
    __table_args__ = (
        CheckConstraint("txn_type = ANY (ARRAY['RECEIVE'::text, 'RESERVE'::text, 'UNRESERVE'::text, 'ISSUE'::text, 'RETURN'::text, 'ADJUST_PLUS'::text, 'ADJUST_MINUS'::text, 'SCRAP'::text])", name='inventory_transactions_txn_type_check'),
        ForeignKeyConstraint(['material_batch_id'], ['material_batches.id'], name='inventory_transactions_material_batch_id_fkey'),
        PrimaryKeyConstraint('id', name='inventory_transactions_pkey'),
        Index('idx_inv_txn_batch', 'material_batch_id'),
        Index('idx_inv_txn_ref', 'ref_type', 'ref_id')
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    material_batch_id: Mapped[int] = mapped_column(BigInteger)
    txn_type: Mapped[str] = mapped_column(Text)
    qty: Mapped[decimal.Decimal] = mapped_column(Numeric(14, 4))
    ref_type: Mapped[Optional[str]] = mapped_column(Text)
    ref_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    note: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True), server_default=text('now()'))

    material_batch: Mapped['MaterialBatches'] = relationship('MaterialBatches', back_populates='inventory_transactions')


class PoLines(Base):
    __tablename__ = 'po_lines'
    __table_args__ = (
        ForeignKeyConstraint(['part_id'], ['parts.id'], name='po_lines_part_id_fkey'),
        ForeignKeyConstraint(['po_id'], ['pos.id'], ondelete='CASCADE', name='po_lines_po_id_fkey'),
        PrimaryKeyConstraint('id', name='po_lines_pkey'),
        Index('idx_polines_part', 'part_id'),
        Index('idx_polines_po', 'po_id')
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    po_id: Mapped[int] = mapped_column(BigInteger)
    ordered_qty: Mapped[int] = mapped_column(Integer)
    part_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    status: Mapped[Optional[str]] = mapped_column(Text)
    stage_timeline: Mapped[Optional[str]] = mapped_column(Text)
    details_before_ship: Mapped[Optional[str]] = mapped_column(Text)
    extras: Mapped[Optional[dict]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))

    part: Mapped[Optional['Parts']] = relationship('Parts', back_populates='po_lines')
    po: Mapped['Pos'] = relationship('Pos', back_populates='po_lines')
    lots: Mapped[List['Lots']] = relationship('Lots', back_populates='po_line')


class WorkflowStepTemplates(Base):
    __tablename__ = 'workflow_step_templates'
    __table_args__ = (
        ForeignKeyConstraint(['workflow_template_id'], ['workflow_templates.id'], ondelete='CASCADE', name='workflow_step_templates_workflow_template_id_fkey'),
        PrimaryKeyConstraint('id', name='workflow_step_templates_pkey'),
        UniqueConstraint('workflow_template_id', 'step_no', name='workflow_step_templates_workflow_template_id_step_no_key'),
        Index('idx_wst_tpl', 'workflow_template_id')
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    workflow_template_id: Mapped[int] = mapped_column(BigInteger)
    step_no: Mapped[int] = mapped_column(Integer)
    step_code: Mapped[Optional[str]] = mapped_column(Text)
    step_name: Mapped[Optional[str]] = mapped_column(Text)
    station: Mapped[Optional[str]] = mapped_column(Text)
    required: Mapped[Optional[bool]] = mapped_column(Boolean, server_default=text('true'))
    expected_duration_minutes: Mapped[Optional[int]] = mapped_column(Integer)
    qa_required: Mapped[Optional[bool]] = mapped_column(Boolean, server_default=text('false'))
    qa_template_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    extras: Mapped[Optional[dict]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))

    workflow_template: Mapped['WorkflowTemplates'] = relationship('WorkflowTemplates', back_populates='workflow_step_templates')
    workflow_step_instances: Mapped[List['WorkflowStepInstances']] = relationship('WorkflowStepInstances', back_populates='step_template')


class Lots(Base):
    __tablename__ = 'lots'
    __table_args__ = (
        CheckConstraint("status = ANY (ARRAY['in_process'::text, 'hold'::text, 'shipped'::text])", name='lots_status_check'),
        ForeignKeyConstraint(['po_line_id'], ['po_lines.id'], ondelete='CASCADE', name='lots_po_line_id_fkey'),
        PrimaryKeyConstraint('id', name='lots_pkey'),
        UniqueConstraint('lot_number', name='lots_lot_number_key'),
        Index('idx_lots_polines', 'po_line_id'),
        Index('idx_lots_tracking', 'tracking_no')
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    po_line_id: Mapped[int] = mapped_column(BigInteger)
    lot_number: Mapped[str] = mapped_column(Text)
    prod_qty: Mapped[int] = mapped_column(Integer)
    qty_shipped: Mapped[Optional[int]] = mapped_column(Integer, server_default=text('0'))
    incoming_stock: Mapped[Optional[int]] = mapped_column(Integer, server_default=text('0'))
    real_shipped_date: Mapped[Optional[datetime.date]] = mapped_column(Date)
    tracking_no: Mapped[Optional[str]] = mapped_column(Text)
    first_article_no: Mapped[Optional[str]] = mapped_column(Text)
    remark_product_control: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[Optional[str]] = mapped_column(Text, server_default=text("'in_process'::text"))
    extras: Mapped[Optional[dict]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    created_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True), server_default=text('now()'))
    updated_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True), server_default=text('now()'))

    po_line: Mapped['PoLines'] = relationship('PoLines', back_populates='lots')
    lot_material_allocations: Mapped[List['LotMaterialAllocations']] = relationship('LotMaterialAllocations', back_populates='lot')
    lot_material_requirements: Mapped[List['LotMaterialRequirements']] = relationship('LotMaterialRequirements', back_populates='lot')
    lot_qr_codes: Mapped['LotQrCodes'] = relationship('LotQrCodes', uselist=False, back_populates='lot')
    workflow_instances: Mapped['WorkflowInstances'] = relationship('WorkflowInstances', uselist=False, back_populates='lot')
    qa_inspections: Mapped[List['QaInspections']] = relationship('QaInspections', back_populates='lot')


class LotMaterialAllocations(Base):
    __tablename__ = 'lot_material_allocations'
    __table_args__ = (
        ForeignKeyConstraint(['lot_id'], ['lots.id'], ondelete='CASCADE', name='lot_material_allocations_lot_id_fkey'),
        ForeignKeyConstraint(['material_batch_id'], ['material_batches.id'], name='lot_material_allocations_material_batch_id_fkey'),
        PrimaryKeyConstraint('id', name='lot_material_allocations_pkey'),
        Index('idx_lma_batch', 'material_batch_id'),
        Index('idx_lma_lot', 'lot_id'),
        Index('ux_lma_lot_batch', 'lot_id', 'material_batch_id', unique=True)
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    lot_id: Mapped[int] = mapped_column(BigInteger)
    material_batch_id: Mapped[int] = mapped_column(BigInteger)
    qty_reserved: Mapped[Optional[decimal.Decimal]] = mapped_column(Numeric(14, 4), server_default=text('0'))
    qty_issued: Mapped[Optional[decimal.Decimal]] = mapped_column(Numeric(14, 4), server_default=text('0'))
    qty_returned: Mapped[Optional[decimal.Decimal]] = mapped_column(Numeric(14, 4), server_default=text('0'))
    qty_scrap: Mapped[Optional[decimal.Decimal]] = mapped_column(Numeric(14, 4), server_default=text('0'))
    notes: Mapped[Optional[str]] = mapped_column(Text)

    lot: Mapped['Lots'] = relationship('Lots', back_populates='lot_material_allocations')
    material_batch: Mapped['MaterialBatches'] = relationship('MaterialBatches', back_populates='lot_material_allocations')


class LotMaterialRequirements(Base):
    __tablename__ = 'lot_material_requirements'
    __table_args__ = (
        ForeignKeyConstraint(['lot_id'], ['lots.id'], ondelete='CASCADE', name='lot_material_requirements_lot_id_fkey'),
        ForeignKeyConstraint(['material_id'], ['materials.id'], name='lot_material_requirements_material_id_fkey'),
        PrimaryKeyConstraint('id', name='lot_material_requirements_pkey'),
        UniqueConstraint('lot_id', 'material_id', name='lot_material_requirements_lot_id_material_id_key')
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    lot_id: Mapped[int] = mapped_column(BigInteger)
    material_id: Mapped[int] = mapped_column(BigInteger)
    qty_required: Mapped[decimal.Decimal] = mapped_column(Numeric(14, 4))
    uom: Mapped[str] = mapped_column(Text)

    lot: Mapped['Lots'] = relationship('Lots', back_populates='lot_material_requirements')
    material: Mapped['Materials'] = relationship('Materials', back_populates='lot_material_requirements')


class LotQrCodes(Base):
    __tablename__ = 'lot_qr_codes'
    __table_args__ = (
        CheckConstraint("format = ANY (ARRAY['text'::text, 'url'::text, 'json'::text])", name='lot_qr_codes_format_check'),
        ForeignKeyConstraint(['lot_id'], ['lots.id'], ondelete='CASCADE', name='lot_qr_codes_lot_id_fkey'),
        PrimaryKeyConstraint('id', name='lot_qr_codes_pkey'),
        UniqueConstraint('lot_id', name='lot_qr_codes_lot_id_key')
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    lot_id: Mapped[int] = mapped_column(BigInteger)
    payload: Mapped[str] = mapped_column(Text)
    format: Mapped[Optional[str]] = mapped_column(Text, server_default=text("'text'::text"))
    image_url: Mapped[Optional[str]] = mapped_column(Text)
    generated_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True), server_default=text('now()'))
    extras: Mapped[Optional[dict]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))

    lot: Mapped['Lots'] = relationship('Lots', back_populates='lot_qr_codes')


class WorkflowInstances(Base):
    __tablename__ = 'workflow_instances'
    __table_args__ = (
        CheckConstraint("status = ANY (ARRAY['in_progress'::text, 'completed'::text, 'hold'::text])", name='workflow_instances_status_check'),
        ForeignKeyConstraint(['lot_id'], ['lots.id'], ondelete='CASCADE', name='workflow_instances_lot_id_fkey'),
        ForeignKeyConstraint(['workflow_template_id'], ['workflow_templates.id'], name='workflow_instances_workflow_template_id_fkey'),
        PrimaryKeyConstraint('id', name='workflow_instances_pkey'),
        UniqueConstraint('lot_id', name='workflow_instances_lot_id_key'),
        Index('idx_wi_tpl', 'workflow_template_id')
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    lot_id: Mapped[int] = mapped_column(BigInteger)
    workflow_template_id: Mapped[int] = mapped_column(BigInteger)
    status: Mapped[Optional[str]] = mapped_column(Text, server_default=text("'in_progress'::text"))
    started_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True), server_default=text('now()'))
    completed_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))

    lot: Mapped['Lots'] = relationship('Lots', back_populates='workflow_instances')
    workflow_template: Mapped['WorkflowTemplates'] = relationship('WorkflowTemplates', back_populates='workflow_instances')
    workflow_step_instances: Mapped[List['WorkflowStepInstances']] = relationship('WorkflowStepInstances', back_populates='workflow_instance')


class WorkflowStepInstances(Base):
    __tablename__ = 'workflow_step_instances'
    __table_args__ = (
        CheckConstraint("status = ANY (ARRAY['pending'::text, 'running'::text, 'passed'::text, 'failed'::text])", name='workflow_step_instances_status_check'),
        ForeignKeyConstraint(['assignee_employee_id'], ['employees.id'], name='workflow_step_instances_assignee_employee_id_fkey'),
        ForeignKeyConstraint(['step_template_id'], ['workflow_step_templates.id'], name='workflow_step_instances_step_template_id_fkey'),
        ForeignKeyConstraint(['workflow_instance_id'], ['workflow_instances.id'], ondelete='CASCADE', name='workflow_step_instances_workflow_instance_id_fkey'),
        PrimaryKeyConstraint('id', name='workflow_step_instances_pkey'),
        Index('idx_wsi_assignee', 'assignee_employee_id'),
        Index('idx_wsi_wi', 'workflow_instance_id')
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    workflow_instance_id: Mapped[int] = mapped_column(BigInteger)
    step_template_id: Mapped[int] = mapped_column(BigInteger)
    step_no: Mapped[int] = mapped_column(Integer)
    status: Mapped[Optional[str]] = mapped_column(Text, server_default=text("'pending'::text"))
    started_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))
    completed_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))
    assignee_employee_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    qa_result: Mapped[Optional[str]] = mapped_column(Text)
    qa_inspection_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    extras: Mapped[Optional[dict]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))

    assignee_employee: Mapped[Optional['Employees']] = relationship('Employees', back_populates='workflow_step_instances')
    step_template: Mapped['WorkflowStepTemplates'] = relationship('WorkflowStepTemplates', back_populates='workflow_step_instances')
    workflow_instance: Mapped['WorkflowInstances'] = relationship('WorkflowInstances', back_populates='workflow_step_instances')
    qa_inspections: Mapped[List['QaInspections']] = relationship('QaInspections', back_populates='step_instance')


class QaInspections(Base):
    __tablename__ = 'qa_inspections'
    __table_args__ = (
        CheckConstraint("result = ANY (ARRAY['pass'::text, 'fail'::text])", name='qa_inspections_result_check'),
        ForeignKeyConstraint(['inspector_employee_id'], ['employees.id'], name='qa_inspections_inspector_employee_id_fkey'),
        ForeignKeyConstraint(['lot_id'], ['lots.id'], ondelete='CASCADE', name='qa_inspections_lot_id_fkey'),
        ForeignKeyConstraint(['step_instance_id'], ['workflow_step_instances.id'], ondelete='SET NULL', name='qa_inspections_step_instance_id_fkey'),
        PrimaryKeyConstraint('id', name='qa_inspections_pkey'),
        Index('idx_qai_emp', 'inspector_employee_id'),
        Index('idx_qai_lot', 'lot_id'),
        Index('idx_qai_step', 'step_instance_id')
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    lot_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    step_instance_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    inspector_employee_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    inspected_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True), server_default=text('now()'))
    result: Mapped[Optional[str]] = mapped_column(Text)
    remarks: Mapped[Optional[str]] = mapped_column(Text)
    extras: Mapped[Optional[dict]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))

    inspector_employee: Mapped[Optional['Employees']] = relationship('Employees', back_populates='qa_inspections')
    lot: Mapped[Optional['Lots']] = relationship('Lots', back_populates='qa_inspections')
    step_instance: Mapped[Optional['WorkflowStepInstances']] = relationship('WorkflowStepInstances', back_populates='qa_inspections')
