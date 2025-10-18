# models.py
from datetime import date, datetime, timezone

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    select,
    func,
    event,
)
from sqlalchemy.orm import (
    relationship,
    validates,
    object_session,
    column_property,
    aliased,
)
from sqlalchemy.ext.hybrid import hybrid_property

from database import Base


# =========================================
# =============== Master ==================
# =========================================

from sqlalchemy import text  # ✅ ย้ายมาด้านบน

class Supplier(Base):
    __tablename__ = "suppliers"

    id = Column(Integer, primary_key=True)
    code = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    contact = Column(String, nullable=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    address = Column(String, nullable=True)
    payment_terms = Column(String, nullable=True)

    # reverse relations
    raw_batches = relationship("RawBatch", back_populates="supplier")

    # ✅ flags + server_default
    is_material_supplier = Column(
        Boolean, nullable=False, default=False, server_default=text("false")  # MySQL/SQLite ใช้ "0"
    )
    is_subcontractor = Column(
        Boolean, nullable=False, default=False, server_default=text("false")  # MySQL/SQLite ใช้ "0"
    )

    __table_args__ = (
        Index("ix_suppliers_roles", "is_material_supplier", "is_subcontractor"),
    )

    # ✅ ใส่ cascade แบบนี้
    services = relationship(
        "SupplierService",
        cascade="all, delete-orphan",
        back_populates="supplier"
    )

    material_categories = relationship(
        "SupplierMaterialCategory",
        cascade="all, delete-orphan",
        back_populates="supplier"
    )

    def __repr__(self):
        return f"<Supplier(code={self.code}, name={self.name})>"


class SupplierServiceCatalog(Base):
    __tablename__ = "supplier_service_catalog"
    code = Column(String, primary_key=True)      # ex. ANODIZE
    name = Column(String, nullable=False)        # ชื่ออ่านง่าย
    category = Column(String, nullable=True)     # FINISH / HEAT_TREAT / TEST ...
    is_active = Column(Boolean, nullable=False, default=True)

    def __repr__(self):
        return f"<SupplierServiceCatalog(code={self.code})>"

class SupplierService(Base):
    __tablename__ = "supplier_services"

    id = Column(Integer, primary_key=True)
    supplier_id = Column(
        Integer,
        ForeignKey("suppliers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    service_code = Column(
        String,
        ForeignKey("supplier_service_catalog.code", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    # relationships
    supplier = relationship("Supplier", back_populates="services")
    service  = relationship("SupplierServiceCatalog")

    __table_args__ = (
        UniqueConstraint("supplier_id", "service_code", name="uq_supplier_service_once"),
        Index("ix_supplier_services_lookup", "service_code", "supplier_id"),
    )

    def __repr__(self):
        return f"<SupplierService(supplier_id={self.supplier_id}, service_code={self.service_code})>"

    
# ===== Catalog: กลุ่มวัสดุ / รูปแบบ / เกรด (กันสะกดผิด) =====
class SupplierMatCategoryCatalog(Base):
    __tablename__ = "supplier_mat_category_catalog"
    code = Column(String, primary_key=True)      # ex. ALUMINUM, STEEL, PLASTIC
    name = Column(String, nullable=False)        # ex. Aluminum
    parent_code = Column(String, ForeignKey("supplier_mat_category_catalog.code"), nullable=True)
    # optional: จัดหมวดหมู่ย่อย เช่น "FORM", "ALLOY"
    kind = Column(String, nullable=True)         # ex. FAMILY / FORM / GRADE
    is_active = Column(Boolean, nullable=False, default=True)

    parent = relationship("SupplierMatCategoryCatalog", remote_side=[code])

    def __repr__(self):
        return f"<MatCat(code={self.code})>"


# ===== Mapping: supplier มี category อะไรบ้าง =====
class SupplierMaterialCategory(Base):
    __tablename__ = "supplier_material_categories"
    id = Column(Integer, primary_key=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id", ondelete="CASCADE"), index=True, nullable=False)
    category_code = Column(String, ForeignKey("supplier_mat_category_catalog.code"), index=True, nullable=False)

    # เมตาเฉพาะเจ้า: MOQ/รูปแบบ/ลีดไทม์/หมายเหตุ
    min_order_qty = Column(Numeric(18, 3), nullable=True)
    uom = Column(String, nullable=True)                # kg / ea / bar / sheet
    lead_time_days = Column(Integer, nullable=True)
    price_note = Column(Text, nullable=True)           # โครงราคา, ส่วนลด, เงื่อนไข
    notes = Column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint("supplier_id", "category_code", name="uq_supplier_matcat_once"),
        Index("ix_supplier_matcat_lookup", "category_code", "supplier_id"),
    )

    supplier = relationship("Supplier", back_populates="material_categories")
    category = relationship("SupplierMatCategoryCatalog")

    def __repr__(self):
        return f"<SupplierMaterialCategory(supplier_id={self.supplier_id}, code={self.category_code})>"

class Customer(Base):
    __tablename__ = "customers"
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    contact = Column(String, nullable=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    address = Column(String, nullable=True)

    pos = relationship("PO", back_populates="customer")

    def __repr__(self):
        return f"<Customer(code={self.code}, name={self.name})>"


class PO(Base):
    __tablename__ = "purchase_orders"
    id = Column(Integer, primary_key=True, index=True)
    po_number = Column(String, unique=True, index=True, nullable=False)
    description = Column(String, nullable=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    customer = relationship("Customer", back_populates="pos", foreign_keys=[customer_id])

    lines = relationship("POLine", back_populates="po", cascade="all, delete-orphan")
    shipments = relationship("CustomerShipment", back_populates="po", cascade="all, delete-orphan")
    invoices = relationship("CustomerInvoice", back_populates="po", cascade="all, delete-orphan")
    lots = relationship(
        "ProductionLot",
        back_populates="po",
        cascade="all, delete-orphan",
        foreign_keys="ProductionLot.po_id",
    )

    def __repr__(self):
        return f"<PO(po_number={self.po_number}, customer_id={self.customer_id})>"


class Employee(Base):
    __tablename__ = "employees"
    id = Column(Integer, primary_key=True, index=True)
    emp_code = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    position = Column(String, nullable=True)
    department = Column(String, nullable=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    status = Column(String, default="active", nullable=False)  # active / inactive

    user = relationship("User", back_populates="employee", uselist=False)

    def __repr__(self):
        return f"<Employee(emp_code={self.emp_code}, name={self.name})>"


# =========================================
# =========== Materials / Batches =========
# =========================================

class RawMaterial(Base):
    __tablename__ = "raw_materials"
    id = Column(Integer, primary_key=True)
    code = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False) # type spec
    type = Column(String, nullable=True) 
    spec = Column(String, nullable=True)
    uom = Column(String, default="kg", nullable=False)
    remark = Column(Text, nullable=True)
    size = Column(Numeric(18, 2), nullable=True)
    size_text = Column(String, nullable=True)

    # map ไปยัง taxonomy
    family_code = Column(String, ForeignKey("supplier_mat_category_catalog.code"), nullable=True, index=True)  # ex. ALUMINUM
    form_code   = Column(String, ForeignKey("supplier_mat_category_catalog.code"), nullable=True, index=True)  # ex. ROUND_BAR
    grade_code  = Column(String, ForeignKey("supplier_mat_category_catalog.code"), nullable=True, index=True)  # ex. 6061

    family = relationship("SupplierMatCategoryCatalog", foreign_keys=[family_code])
    form   = relationship("SupplierMatCategoryCatalog", foreign_keys=[form_code])
    grade  = relationship("SupplierMatCategoryCatalog", foreign_keys=[grade_code])

    batches = relationship("RawBatch", back_populates="material")

class MaterialPO(Base):
    __tablename__ = "material_pos"
    id = Column(Integer, primary_key=True)
    mat_po_no = Column(String, unique=False, index=True, nullable=True)
    po_number = Column(String, unique=True, index=True, nullable=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=False, index=True)
    order_date = Column(Date, default=date.today, nullable=False)
    status = Column(String, default="open", nullable=False)  # open/confirmed/received/closed
    notes = Column(Text)

    supplier = relationship("Supplier")
    lines = relationship("MaterialPOLine", back_populates="po", cascade="all, delete-orphan")


class MaterialPOLine(Base):
    __tablename__ = "material_po_lines"
    id = Column(Integer, primary_key=True)
    po_id = Column(Integer, ForeignKey("material_pos.id"), nullable=False, index=True)
    material_id = Column(Integer, ForeignKey("raw_materials.id"), nullable=False, index=True)
    qty_ordered = Column(Numeric(18, 3), nullable=False)

    unit_price = Column(Numeric(18, 2), nullable=True)
    price_each = Column(Numeric(18, 2), nullable=True)   # ✅ NEW
    total_price = Column(Numeric(18, 2), nullable=True)   # ✅ NEW
    cut_charge = Column(Numeric(18, 2), nullable=True)    # ✅ NEW
    due_date = Column(Date, nullable=True)

    part_no = Column(String, nullable=True, index=True)   # ✅ NEW (เพื่อ map กับ CSV)
    heat_lot = Column(Text, nullable=True)
    size = Column(Text, nullable=True)
    length = Column(Numeric(18, 3), nullable=True)
    weight = Column(Numeric(18, 3), nullable=True)
    cert = Column(Text, nullable=True)

    batches = relationship("RawBatch", back_populates="po_line")
    po = relationship("MaterialPO", back_populates="lines")
    material = relationship("RawMaterial")



    


class RawBatch(Base):
    __tablename__ = "raw_batches"

    id = Column(Integer, primary_key=True)
    material_id = Column(Integer, ForeignKey("raw_materials.id"), nullable=False, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True, index=True)

    # Link to Material PO
    material_po_line_id = Column(Integer, ForeignKey("material_po_lines.id"), index=True, nullable=True)
    po_id = Column(Integer, ForeignKey("material_pos.id"), index=True, nullable=True)  # denormalized for faster lookups

    batch_no = Column(String, index=True, nullable=False)  # supplier batch number
    supplier_batch_no = Column(String, nullable=True)
    mill_name = Column(String, nullable=True)
    mill_heat_no = Column(String, nullable=True)

    received_at = Column(Date, nullable=True)
    qty_received = Column(Numeric(18, 3), nullable=False, default=0)
    cert_file = Column(String, nullable=True)
    location = Column(String, nullable=True)

    heat_lot = Column(Text, nullable=True)
    size = Column(Text, nullable=True)
    length = Column(Numeric(18, 3), nullable=True)
    length_text = Column(String, nullable=True)   # ✅ NEW (raw text เช่น "20 ft")
    weight = Column(Numeric(18, 3), nullable=True)
    cert = Column(Text, nullable=True)
    # relations
    material = relationship("RawMaterial", back_populates="batches")
    supplier = relationship("Supplier", back_populates="raw_batches")
    po_line = relationship("MaterialPOLine", back_populates="batches", foreign_keys=[material_po_line_id])
    po = relationship("MaterialPO", foreign_keys=[po_id])
    uses = relationship("LotMaterialUse", back_populates="batch")

    __table_args__ = (
        UniqueConstraint("material_id", "batch_no", "supplier_id", name="uq_batch_material_supplier"),
        Index("ix_raw_batches_mat_recv", "material_id", "received_at"),
        Index("ix_raw_batches_supplier", "supplier_id"),
        Index("ix_raw_batches_po", "po_id"),
    )

    def __repr__(self):
        return f"<RawBatch(material_id={self.material_id}, batch_no={self.batch_no})>"


# =========================================
# ======= Part Master / Part Revisions ====
# =========================================

class Part(Base):
    __tablename__ = "parts"
    id = Column(Integer, primary_key=True)
    part_no = Column(String, unique=True, index=True, nullable=False)
    name = Column(String)
    description = Column(Text)
    default_uom = Column(String, default="ea")
    status = Column(String, default="active")

    revisions = relationship("PartRevision", back_populates="part", cascade="all, delete-orphan")

    # inverse side for ProductionLot.part
    production_lots = relationship(
        "ProductionLot",
        back_populates="part",
        foreign_keys="ProductionLot.part_id",
    )

    # selection relationships
    processes = relationship("PartProcessSelection", back_populates="part", cascade="all, delete-orphan")
    finishes = relationship("PartFinishSelection", back_populates="part", cascade="all, delete-orphan")
    other_notes = relationship("PartOtherNote", back_populates="part", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Part(part_no={self.part_no})>"


class PartRevision(Base):
    __tablename__ = "part_revisions"

    id = Column(Integer, primary_key=True)
    part_id = Column(Integer, ForeignKey("parts.id"), nullable=False, index=True)
    rev = Column(String, nullable=False)
    drawing_file = Column(String)
    spec = Column(String)
    is_current = Column(Boolean, default=False, nullable=False)

    part = relationship("Part", back_populates="revisions", foreign_keys=[part_id])

    __table_args__ = (
        UniqueConstraint("part_id", "rev", name="uq_part_rev"),
        UniqueConstraint("part_id", "id", name="uq_part_id_id"),
        Index("ix_part_revisions_part_rev", "part_id", "rev"),
    )

    # FAIR quick link/cache
    fair_record_id = Column(
        Integer,
        ForeignKey("inspection_records.id", ondelete="SET NULL"),
        nullable=True,
        unique=True,
        index=True,
    )
    fair_record = relationship("InspectionRecord", foreign_keys=[fair_record_id])

    fair_no_cache = Column(String, nullable=True)
    fair_date_cache = Column(Date, nullable=True)

    production_lots = relationship(
        "ProductionLot",
        back_populates="part_revision",
        foreign_keys="ProductionLot.part_revision_id",
    )

    inspection_records = relationship(
        "InspectionRecord",
        back_populates="part_revision",
        foreign_keys="InspectionRecord.part_revision_id",
    )

    def __repr__(self):
        return f"<PartRevision(part_id={self.part_id}, rev={self.rev})>"


class PartMaterial(Base):
    __tablename__ = "part_materials"
    id = Column(Integer, primary_key=True)
    part_id = Column(Integer, ForeignKey("parts.id", ondelete="CASCADE"), index=True, nullable=False)
    part_revision_id = Column(Integer, ForeignKey("part_revisions.id", ondelete="CASCADE"), index=True, nullable=True)
    raw_material_id = Column(Integer, ForeignKey("raw_materials.id", ondelete="RESTRICT"), index=True, nullable=False)
    qty_per = Column(Numeric(18, 3), nullable=True)
    uom = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    part = relationship("Part", backref="part_materials")
    rev = relationship("PartRevision")
    raw_material = relationship("RawMaterial")

    __table_args__ = (
        UniqueConstraint("part_id", "part_revision_id", "raw_material_id", name="uq_part_rev_material_once"),
    )


# =========================================
# ======== Production / Lot / Traveler ====
# =========================================

class ProductionLot(Base):
    __tablename__ = "production_lots"

    id = Column(Integer, primary_key=True)
    lot_no = Column(String, unique=True, index=True, nullable=False)

    part_id = Column(Integer, ForeignKey("parts.id"), nullable=False, index=True)
    part_revision_id = Column(Integer, ForeignKey("part_revisions.id"), nullable=True, index=True)
    po_id = Column(Integer, ForeignKey("purchase_orders.id"), nullable=True, index=True)
    po_line_id = Column(Integer, ForeignKey("po_lines.id"), nullable=True, index=True)

    planned_qty = Column(Integer, nullable=False, default=0)
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    lot_due_date = Column(Date, nullable=True, index=True)
    status = Column(String, nullable=False, default="in_process")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    note =  Column(String,  nullable=True)
    


    __table_args__ = (
        Index("ix_lots_no", "lot_no"),
        Index("ix_lots_status", "status"),
        Index("ix_lots_part", "part_id", "part_revision_id"),
    )

    part = relationship("Part", foreign_keys=[part_id], back_populates="production_lots")
    part_revision = relationship("PartRevision", foreign_keys=[part_revision_id], back_populates="production_lots")
    po = relationship("PO", back_populates="lots", foreign_keys=[po_id])
    po_line = relationship("POLine", foreign_keys=[po_line_id])
    material_uses = relationship("LotMaterialUse", back_populates="lot", cascade="all, delete-orphan")
    travelers = relationship(
        "ShopTraveler",
        back_populates="lot",
        cascade="all, delete-orphan",
        order_by="ShopTraveler.created_at.asc()",
    )

    fair_required = Column(Boolean, nullable=False, default=False)
    fair_record_id = Column(Integer, ForeignKey("inspection_records.id", ondelete="SET NULL"), nullable=True, index=True)
    fair_note =  Column(String,  nullable=True)
    fair_record = relationship(
        "InspectionRecord",
        foreign_keys=[fair_record_id],
        back_populates="fair_for_lot",
        uselist=False,
    )

    @validates("po_line_id")
    def _on_set_po_line(self, key, v):
        sess = object_session(self)
        if v is None:
            return v
        pl = sess.get(POLine, v) if sess else None
        if not pl:
            return v
        # sync from PO line
        self.po_id = pl.po_id
        self.part_id = pl.part_id
        self.part_revision_id = pl.revision_id
        return v

    def __repr__(self):
        return f"<ProductionLot(lot_no={self.lot_no}, status={self.status})>"


class LotMaterialUse(Base):
    __tablename__ = "lot_material_use"

    id = Column(Integer, primary_key=True)
    lot_id = Column(Integer, ForeignKey("production_lots.id"), nullable=False, index=True)
    batch_id = Column(Integer, ForeignKey("raw_batches.id"), nullable=False, index=True)
    raw_material_id = Column(Integer, ForeignKey("raw_materials.id"), nullable=False, index=True)  # denormalized for faster join
    qty = Column(Numeric(18, 3), nullable=False)
    uom = Column(String, nullable=True)
    used_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    used_by_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    note = Column(Text, nullable=True)

    lot = relationship("ProductionLot", back_populates="material_uses")
    batch = relationship("RawBatch", back_populates="uses")
    raw_material = relationship("RawMaterial")
    used_by = relationship("Employee")

    __table_args__ = (
        Index("ix_lmu_lot", "lot_id"),
        Index("ix_lmu_batch", "batch_id"),
        Index("ix_lmu_rm", "raw_material_id"),
    )

    def __repr__(self):
        return f"<LotMaterialUse(lot_id={self.lot_id}, batch_id={self.batch_id}, qty={self.qty})>"
    
    
class LotMaterialUseHistory(Base):
    __tablename__ = "lot_material_use_history"

    id = Column(Integer, primary_key=True)
    lot_id = Column(Integer, ForeignKey("production_lots.id"))
    raw_material_id = Column(Integer, ForeignKey("raw_materials.id"))
    batch_id = Column(Integer, ForeignKey("raw_batches.id"))
    qty = Column(Numeric(12, 3))
    uom = Column(String(10))
    action = Column(String(20))  # "ALLOCATE" or "RETURN"
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class ShopTraveler(Base):
    __tablename__ = "shop_travelers"
    id = Column(Integer, primary_key=True)
    traveler_no = Column(String, unique=True, index=True)
    lot_id = Column(Integer, ForeignKey("production_lots.id"), nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    created_by_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    status = Column(String, nullable=False, default="open")
    notes = Column(Text, nullable=True)
    production_due_date = Column(Date, nullable=True, index=True)

    lot = relationship("ProductionLot", back_populates="travelers")
    created_by = relationship("Employee", foreign_keys=[created_by_id])
    steps = relationship(
        "ShopTravelerStep",
        back_populates="traveler",
        cascade="all, delete-orphan",
        order_by="ShopTravelerStep.seq",
    )

    __table_args__ = (Index("ix_shop_travelers_status", "status"),)

    def __repr__(self):
        return f"<ShopTraveler(lot_id={self.lot_id}, status={self.status})>"


class ShopTravelerStep(Base):
    __tablename__ = "shop_traveler_steps"
    id = Column(Integer, primary_key=True)
    traveler_id = Column(Integer, ForeignKey("shop_travelers.id"), nullable=False, index=True)

    seq = Column(Integer, nullable=False)
    step_code = Column(String, nullable=True)
    step_name = Column(String, nullable=False)
    station = Column(String, nullable=True)

    status = Column(String, nullable=False, default="pending")
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)

    operator_id = Column(Integer, ForeignKey("employees.id"), nullable=True, index=True)
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=True, index=True)

    qa_required = Column(Boolean, default=False, nullable=False)
    qa_result = Column(String, nullable=True)
    qa_notes = Column(Text, nullable=True)

    qty_receive = Column(Numeric(18, 3), nullable=False, default=0)
    qty_accept  = Column(Numeric(18, 3), nullable=False, default=0)
    qty_reject  = Column(Numeric(18, 3), nullable=False, default=0)

    # 👇 ใหม่
    step_note = Column(Text, nullable=True)

    traveler = relationship("ShopTraveler", back_populates="steps")
    operator = relationship("Employee", foreign_keys=[operator_id])
    machine  = relationship("Machine", back_populates="step_assignments")

    __table_args__ = (
        UniqueConstraint("traveler_id", "seq", name="uq_traveler_seq"),
        Index("ix_traveler_steps_status", "status"),
        Index("ix_traveler_steps_operator", "operator_id"),
        Index("ix_traveler_steps_machine", "machine_id"),
    )

    def __repr__(self):
        return f"<ShopTravelerStep(traveler_id={self.traveler_id}, seq={self.seq}, status={self.status})>"

# =========================================
# ============ Subcontracting =============
# =========================================

class SubconOrder(Base):
    __tablename__ = "subcon_orders"
    id = Column(Integer, primary_key=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=False, index=True)
    ref_no = Column(String, nullable=True)
    status = Column(String, nullable=False, default="open")  # open/confirmed/shipped/received/closed/cancelled
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    due_date = Column(Date, nullable=True)
    notes = Column(Text, nullable=True)

    supplier = relationship("Supplier")
    lines = relationship("SubconOrderLine", back_populates="order", cascade="all, delete-orphan")
    shipments = relationship("SubconShipment", back_populates="order", cascade="all, delete-orphan")
    receipts = relationship("SubconReceipt", back_populates="order", cascade="all, delete-orphan")

    __table_args__ = (Index("ix_subcon_orders_supplier_status", "supplier_id", "status"),)

    def __repr__(self):
        return f"<SubconOrder(id={self.id}, supplier_id={self.supplier_id}, status={self.status})>"


class SubconOrderLine(Base):
    __tablename__ = "subcon_order_lines"
    id = Column(Integer, primary_key=True)
    order_id = Column(Integer, ForeignKey("subcon_orders.id"), nullable=False, index=True)
    traveler_step_id = Column(Integer, ForeignKey("shop_traveler_steps.id"), nullable=False, index=True)

    qty_planned = Column(Numeric(18, 3), nullable=False, default=0)
    unit_cost = Column(Numeric(18, 2), nullable=True)

    order = relationship("SubconOrder", back_populates="lines")
    step = relationship("ShopTravelerStep")

    __table_args__ = (
        UniqueConstraint("order_id", "traveler_step_id", name="uq_order_step"),
        Index("ix_subcon_order_lines_step", "traveler_step_id"),
    )

    def __repr__(self):
        return f"<SubconOrderLine(order_id={self.order_id}, step_id={self.traveler_step_id})>"


class SubconShipment(Base):
    __tablename__ = "subcon_shipments"
    id = Column(Integer, primary_key=True)
    order_id = Column(Integer, ForeignKey("subcon_orders.id"), nullable=False, index=True)

    shipped_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    shipped_by = Column(String, nullable=True)
    package_no = Column(String, nullable=True)
    carrier = Column(String, nullable=True)
    tracking_no = Column(String, nullable=True)
    status = Column(String, nullable=False, default="shipped")  # shipped/partially_received/closed

    order = relationship("SubconOrder", back_populates="shipments")
    items = relationship("SubconShipmentItem", back_populates="shipment", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<SubconShipment(order_id={self.order_id}, status={self.status})>"


class SubconShipmentItem(Base):
    __tablename__ = "subcon_shipment_items"
    id = Column(Integer, primary_key=True)
    shipment_id = Column(Integer, ForeignKey("subcon_shipments.id"), nullable=False, index=True)
    traveler_step_id = Column(Integer, ForeignKey("shop_traveler_steps.id"), nullable=False, index=True)

    qty = Column(Numeric(18, 3), nullable=False, default=0)

    shipment = relationship("SubconShipment", back_populates="items")
    step = relationship("ShopTravelerStep")

    __table_args__ = (Index("ix_subcon_shipment_items_step", "traveler_step_id"),)

    def __repr__(self):
        return f"<SubconShipmentItem(shipment_id={self.shipment_id}, step_id={self.traveler_step_id}, qty={self.qty})>"


class SubconReceipt(Base):
    __tablename__ = "subcon_receipts"
    id = Column(Integer, primary_key=True)
    order_id = Column(Integer, ForeignKey("subcon_orders.id"), nullable=False, index=True)

    received_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    received_by = Column(String, nullable=True)
    doc_no = Column(String, nullable=True)
    status = Column(String, nullable=False, default="received")  # received/partial/rejected

    order = relationship("SubconOrder", back_populates="receipts")
    items = relationship("SubconReceiptItem", back_populates="receipt", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<SubconReceipt(order_id={self.order_id}, status={self.status})>"


class SubconReceiptItem(Base):
    __tablename__ = "subcon_receipt_items"
    id = Column(Integer, primary_key=True)
    receipt_id = Column(Integer, ForeignKey("subcon_receipts.id"), nullable=False, index=True)
    traveler_step_id = Column(Integer, ForeignKey("shop_traveler_steps.id"), nullable=False, index=True)

    qty_received = Column(Numeric(18, 3), nullable=False, default=0)
    qty_rejected = Column(Numeric(18, 3), nullable=False, default=0)
    scrap_qty = Column(Numeric(18, 3), nullable=False, default=0)
    qa_result = Column(String, nullable=True)   # pass/fail/partial
    qa_notes = Column(Text, nullable=True)

    receipt = relationship("SubconReceipt", back_populates="items")
    step = relationship("ShopTravelerStep")

    __table_args__ = (Index("ix_subcon_receipt_items_step", "traveler_step_id"),)

    def __repr__(self):
        return f"<SubconReceiptItem(receipt_id={self.receipt_id}, step_id={self.traveler_step_id})>"


# =========================================
# ================ Machines ===============
# =========================================

class Machine(Base):
    __tablename__ = "machines"
    id = Column(Integer, primary_key=True)
    code = Column(String, unique=True, index=True, nullable=False)   # e.g. CNC-01
    name = Column(String, nullable=False)                            # e.g. HAAS VF-2
    type = Column(String, nullable=True)                             # CNC_MILL / CNC_LATHE / ...
    controller = Column(String, nullable=True)                       # FANUC / HAAS / ...
    axis_count = Column(Integer, nullable=True)
    spindle_power_kw = Column(Numeric(10, 3), nullable=True)
    max_travel_x = Column(Numeric(10, 3), nullable=True)
    max_travel_y = Column(Numeric(10, 3), nullable=True)
    max_travel_z = Column(Numeric(10, 3), nullable=True)
    location = Column(String, nullable=True)
    status = Column(String, nullable=False, default="available")     # available / busy / maintenance / down / offline
    notes = Column(Text, nullable=True)

    step_assignments = relationship("ShopTravelerStep", back_populates="machine")
    schedules = relationship("MachineSchedule", back_populates="machine", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_machines_status", "status"),
        Index("ix_machines_type_status", "type", "status"),
    )

    def __repr__(self):
        return f"<Machine(code={self.code}, status={self.status})>"


class StepMachineOption(Base):
    __tablename__ = "step_machine_options"
    id = Column(Integer, primary_key=True)
    traveler_step_id = Column(Integer, ForeignKey("shop_traveler_steps.id"), nullable=False, index=True)
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=False, index=True)
    priority = Column(Integer, nullable=True)  # 1 = preferred

    step = relationship("ShopTravelerStep", backref="eligible_machines")
    machine = relationship("Machine")

    __table_args__ = (
        UniqueConstraint("traveler_step_id", "machine_id", name="uq_step_machine_option"),
        Index("ix_step_machine_option_step", "traveler_step_id"),
        Index("ix_step_machine_option_machine", "machine_id"),
    )

    def __repr__(self):
        return f"<StepMachineOption(step_id={self.traveler_step_id}, machine_id={self.machine_id})>"


class MachineSchedule(Base):
    __tablename__ = "machine_schedule"
    id = Column(Integer, primary_key=True)
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=False, index=True)
    traveler_step_id = Column(Integer, ForeignKey("shop_traveler_steps.id"), nullable=False, index=True)

    planned_start = Column(DateTime(timezone=True), nullable=True)
    planned_end = Column(DateTime(timezone=True), nullable=True)
    status = Column(String, nullable=False, default="scheduled")  # scheduled/started/completed/cancelled

    machine = relationship("Machine", back_populates="schedules")
    step = relationship("ShopTravelerStep", backref="machine_schedules")

    __table_args__ = (
        UniqueConstraint("machine_id", "traveler_step_id", name="uq_machine_step_once"),
        Index("ix_machine_schedule_machine", "machine_id", "planned_start"),
    )

    def __repr__(self):
        return f"<MachineSchedule(machine_id={self.machine_id}, step_id={self.traveler_step_id}, status={self.status})>"


# =========================================
# ========== Measurement / QA =============
# =========================================

class MeasurementDevice(Base):
    __tablename__ = "measurement_devices"
    id = Column(Integer, primary_key=True)
    code = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    type = Column(String, nullable=True)
    brand = Column(String, nullable=True)
    model = Column(String, nullable=True)
    serial_no = Column(String, nullable=True)
    location = Column(String, nullable=True)
    status = Column(String, nullable=False, default="available")    # available / in_use / maintenance / out_of_calibration
    calibration_due = Column(Date, nullable=True)
    notes = Column(Text, nullable=True)

    calibrations = relationship("DeviceCalibration", back_populates="device", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_measurement_devices_status", "status"),
        Index("ix_measurement_devices_type", "type"),
        Index("ix_measurement_devices_cal_due", "calibration_due"),
    )

    def __repr__(self):
        return f"<MeasurementDevice(code={self.code}, status={self.status})>"


class DeviceCalibration(Base):
    __tablename__ = "device_calibrations"
    id = Column(Integer, primary_key=True)
    device_id = Column(Integer, ForeignKey("measurement_devices.id"), nullable=False, index=True)
    calibrated_at = Column(Date, nullable=False)
    due_at = Column(Date, nullable=True)
    performed_by = Column(String, nullable=True)
    result = Column(String, nullable=True)           # pass / fail
    certificate_file = Column(String, nullable=True)

    device = relationship("MeasurementDevice", back_populates="calibrations")

    __table_args__ = (Index("ix_device_calibrations_device", "device_id", "calibrated_at"),)

    def __repr__(self):
        return f"<DeviceCalibration(device_id={self.device_id}, calibrated_at={self.calibrated_at})>"


class InspectionRecord(Base):
    __tablename__ = "inspection_records"
    id = Column(Integer, primary_key=True)
    traveler_step_id = Column(Integer, ForeignKey("shop_traveler_steps.id"), nullable=False, index=True)

    is_fair = Column(Boolean, nullable=False, default=False)
    fair_no = Column(String, nullable=True)
    fair_doc_file = Column(String, nullable=True)
    fair_date = Column(Date, nullable=True)

    part_revision_id = Column(
        Integer,
        ForeignKey("part_revisions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    part_revision = relationship(
        "PartRevision",
        foreign_keys=[part_revision_id],
        back_populates="inspection_records",
        passive_deletes=True,
    )

    inspector_id = Column(Integer, ForeignKey("employees.id"), nullable=True, index=True)
    device_id = Column(Integer, ForeignKey("measurement_devices.id"), nullable=True, index=True)
    started_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    finished_at = Column(DateTime(timezone=True), nullable=True)

    overall_result = Column(String, nullable=True)
    notes = Column(Text, nullable=True)

    traveler_step = relationship("ShopTravelerStep", backref="inspection_records")
    inspector = relationship("Employee")
    device = relationship("MeasurementDevice")
    items = relationship("InspectionItem", back_populates="record", cascade="all, delete-orphan")

    # inverse of ProductionLot.fair_record (FK lives on ProductionLot)
    fair_for_lot = relationship(
        "ProductionLot",
        back_populates="fair_record",
        uselist=False,
        primaryjoin="InspectionRecord.id == ProductionLot.fair_record_id",
    )

    __table_args__ = (
        Index("ix_inspection_records_result", "overall_result"),
        Index("ix_inspection_records_fair_rev", "part_revision_id", "is_fair"),
    )

    def __repr__(self):
        return f"<InspectionRecord(step_id={self.traveler_step_id}, FAIR={self.is_fair}, result={self.overall_result})>"


class InspectionItem(Base):
    __tablename__ = "inspection_items"
    id = Column(Integer, primary_key=True)
    record_id = Column(Integer, ForeignKey("inspection_records.id"), nullable=False, index=True)

    characteristic = Column(String, nullable=False)
    nominal_value = Column(Numeric(18, 4), nullable=True)
    tol_lower = Column(Numeric(18, 4), nullable=True)
    tol_upper = Column(Numeric(18, 4), nullable=True)
    measured_value = Column(Numeric(18, 4), nullable=True)
    unit = Column(String, nullable=True)
    result = Column(String, nullable=True)               # pass / fail
    device_id = Column(Integer, ForeignKey("measurement_devices.id"), nullable=True, index=True)
    attachment = Column(String, nullable=True)

    record = relationship("InspectionRecord", back_populates="items")
    device = relationship("MeasurementDevice")

    __table_args__ = (
        Index("ix_inspection_items_record", "record_id"),
        Index("ix_inspection_items_result", "result"),
    )

    def __repr__(self):
        return f"<InspectionItem(record_id={self.record_id}, characteristic={self.characteristic})>"


# =========================================
# ============== Auth / RBAC =============
# =========================================

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=True)
    password_hash = Column(String, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    is_superuser = Column(Boolean, default=False, nullable=False)

    employee_id = Column(
        Integer,
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
        unique=True,
        index=True,
    )
    employee = relationship("Employee", back_populates="user", uselist=False)

    user_roles = relationship(
        "UserRole",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_login_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (Index("ix_users_active", "is_active"),)

    def __repr__(self):
        return f"<User(username={self.username}, active={self.is_active})>"


class Role(Base):
    __tablename__ = "roles"
    id = Column(Integer, primary_key=True)
    code = Column(String, unique=True, index=True, nullable=False)   # e.g. ADMIN, QA, OPERATOR
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)

    role_users = relationship(
        "UserRole",
        back_populates="role",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    def __repr__(self):
        return f"<Role(code={self.code})>"


class UserRole(Base):
    __tablename__ = "user_roles"

    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    role_id = Column(
        Integer,
        ForeignKey("roles.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    assigned_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User", back_populates="user_roles")
    role = relationship("Role", back_populates="role_users")

    def __repr__(self):
        return f"<UserRole(user_id={self.user_id}, role_id={self.role_id})>"


class Permission(Base):
    __tablename__ = "permissions"
    id = Column(Integer, primary_key=True)
    code = Column(String, unique=True, index=True, nullable=False)   # e.g. VIEW_LOT, EDIT_LOT, CLOSE_TRAVELER
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)

    def __repr__(self):
        return f"<Permission(code={self.code})>"


class RolePermission(Base):
    __tablename__ = "role_permissions"
    role_id = Column(Integer, ForeignKey("roles.id"), primary_key=True)
    permission_id = Column(Integer, ForeignKey("permissions.id"), primary_key=True)

    role = relationship("Role", backref="role_permissions")
    permission = relationship("Permission", backref="permission_roles")

    def __repr__(self):
        return f"<RolePermission(role_id={self.role_id}, permission_id={self.permission_id})>"


# =========================================
# ============== Time Tracking ============
# =========================================

class TimeEntry(Base):
    __tablename__ = "time_entries"

    id = Column(Integer, primary_key=True)

    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    payroll_emp_id = Column(Integer, ForeignKey("employees.id", ondelete="SET NULL"), nullable=True, index=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    work_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)

    clock_in_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    clock_in_method = Column(String, nullable=True)
    clock_in_location = Column(String, nullable=True)

    clock_out_at = Column(DateTime(timezone=True), nullable=True)
    clock_out_method = Column(String, nullable=True)
    clock_out_location = Column(String, nullable=True)

    status = Column(String, nullable=False, default="open")
    notes = Column(Text, nullable=True)

    employee = relationship("Employee", foreign_keys=[employee_id])
    payroll_employee = relationship("Employee", foreign_keys=[payroll_emp_id])

    created_by_user = relationship("User", foreign_keys=[created_by_user_id])
    payroll_user = relationship("User", foreign_keys=[work_user_id])

    pay_period_id = Column(Integer, ForeignKey("pay_periods.id"), index=True, nullable=True)
    pay_period = relationship("PayPeriod", backref="time_entries")

    __table_args__ = (
        Index("ix_time_entries_emp_status", "employee_id", "status"),
        Index("ix_time_entries_in", "clock_in_at"),
        Index("ix_time_entries_out", "clock_out_at"),
        Index("ix_time_entries_work_user", "work_user_id"),
        Index("ix_time_entries_emp_work_week", "employee_id", "work_user_id", "clock_in_at"),
        Index("ix_time_entries_payroll_emp", "payroll_emp_id"),
    )

    def __repr__(self):
        return f"<TimeEntry(emp_id={self.employee_id}, work_user_id={self.work_user_id}, status={self.status})>"


class BreakEntry(Base):
    __tablename__ = "break_entries"
    id = Column(Integer, primary_key=True)
    time_entry_id = Column(Integer, ForeignKey("time_entries.id"), nullable=False, index=True)
    break_type = Column(String, nullable=False, default="lunch")
    start_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    end_at = Column(DateTime(timezone=True), nullable=True)
    method = Column(String, nullable=True)
    location = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    is_paid = Column(Boolean, nullable=False, default=False)

    time_entry = relationship("TimeEntry", backref="breaks")

    __table_args__ = (
        Index("ix_break_entries_parent", "time_entry_id"),
        Index("ix_break_entries_start", "start_at"),
        Index("ix_break_entries_end", "end_at"),
    )


class TimeLeave(Base):
    __tablename__ = "time_leaves"
    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    leave_type = Column(String, nullable=False)  # vacation/sick/...
    start_at = Column(DateTime(timezone=True), nullable=False)
    end_at = Column(DateTime(timezone=True), nullable=False)
    hours = Column(Numeric(5, 2), nullable=True)
    is_paid = Column(Boolean, nullable=False, default=True)
    status = Column(String, nullable=False, default="approved")
    notes = Column(Text)

    employee = relationship("Employee")

    __table_args__ = (Index("ix_time_leaves_emp_date", "employee_id", "start_at", "end_at"),)


class Holiday(Base):
    __tablename__ = "holidays"
    id = Column(Integer, primary_key=True)
    holiday_date = Column(Date, nullable=False, unique=True)
    name = Column(String, nullable=False)
    is_paid = Column(Boolean, nullable=False, default=True)
    hours = Column(Numeric(4, 2), nullable=True)
    pay_multiplier = Column(Numeric(3, 2), default=1, nullable=False)


class PayRate(Base):
    __tablename__ = "pay_rates"
    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), index=True, nullable=False)
    effective_from = Column(DateTime(timezone=True), nullable=False)
    hourly_rate = Column(Numeric(8, 2), nullable=False)
    ot_multiplier = Column(Numeric(4, 2), default=1.5, nullable=False)
    dt_multiplier = Column(Numeric(4, 2), default=2.0, nullable=False)

    __table_args__ = (
        Index("ix_pay_rates_emp_eff", "employee_id", "effective_from"),
        UniqueConstraint("employee_id", "effective_from", name="uq_pay_rates_emp_eff"),
    )


class PayPeriod(Base):
    __tablename__ = "pay_periods"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=True)  # eg. "2025-W17", "2025-PP-08A"
    start_at = Column(DateTime(timezone=True), nullable=False)  # [start, end)
    end_at = Column(DateTime(timezone=True), nullable=False)
    status = Column(String, nullable=False, default="open")  # open/locked/paid
    anchor = Column(String, nullable=True)
    notes = Column(Text, nullable=True)

    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    locked_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    locked_at = Column(DateTime(timezone=True), nullable=True)
    paid_at = Column(DateTime(timezone=True), nullable=True)

    created_by_emp_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    locked_by_emp_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    paid_by_emp_id = Column(Integer, ForeignKey("employees.id"), nullable=True)

    created_by_emp = relationship("Employee", foreign_keys=[created_by_emp_id])
    locked_by_emp = relationship("Employee", foreign_keys=[locked_by_emp_id])
    paid_by_emp = relationship("Employee", foreign_keys=[paid_by_emp_id])

    __table_args__ = (
        Index("ix_pay_periods_range", "start_at", "end_at"),
        UniqueConstraint("start_at", "end_at", name="uq_pay_periods_range"),
        CheckConstraint("end_at > start_at", name="ck_pay_periods_valid"),
    )


class POLine(Base):
    __tablename__ = "po_lines"

    id = Column(Integer, primary_key=True)
    po_id = Column(Integer, ForeignKey("purchase_orders.id"), nullable=False, index=True)
    part_id = Column(Integer, ForeignKey("parts.id"), nullable=False, index=True)
    revision_id = Column(Integer, nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    qty_ordered = Column(Numeric(18, 3), nullable=False)
    unit_price = Column(Numeric(18, 2))
    due_date = Column(DateTime(timezone=True))
    second_due_date = Column(DateTime(timezone=True))
    notes = Column(Text)

    po = relationship("PO", back_populates="lines", foreign_keys=[po_id])
    part = relationship("Part", foreign_keys=[part_id])
    rev = relationship("PartRevision", foreign_keys=[revision_id])

    __table_args__ = (
        Index("ix_po_lines_po", "po_id"),
        Index("ix_po_lines_part_rev", "part_id", "revision_id"),
        ForeignKeyConstraint(
            ["part_id", "revision_id"],
            ["part_revisions.part_id", "part_revisions.id"],
            name="fk_poline_part_rev_pair",
        ),
    )

    @validates("revision_id")
    def _validate_revision(self, key, rev_id):
        if rev_id is None:
            return rev_id
        if not self.part_id:
            return rev_id
        sess = object_session(self)
        pr = sess.get(PartRevision, rev_id) if sess else None
        if pr and pr.part_id != self.part_id:
            raise ValueError("revision_id does not belong to part_id")
        return rev_id

    @validates("part_id")
    def _validate_part(self, key, part_id):
        if self.revision_id:
            sess = object_session(self)
            pr = sess.get(PartRevision, self.revision_id) if sess else None
            if pr and pr.part_id != part_id:
                raise ValueError("revision_id does not belong to part_id")
        return part_id


# ===== Customer Shipment =====
class CustomerShipment(Base):
    __tablename__ = "customer_shipments"
    id = Column(Integer, primary_key=True)
    po_id = Column(Integer, ForeignKey("purchase_orders.id"), nullable=False, index=True)
    shipped_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    ship_to = Column(String, nullable=True)
    carrier = Column(String, nullable=True)
    tracking_no = Column(String, nullable=True)
    notes = Column(Text)
    package_no = Column(String, nullable=True, index=True)  # <-- add this

    po = relationship("PO", back_populates="shipments")
    items = relationship("CustomerShipmentItem", back_populates="shipment", cascade="all, delete-orphan")


class CustomerShipmentItem(Base):
    __tablename__ = "customer_shipment_items"
    id = Column(Integer, primary_key=True)
    shipment_id = Column(Integer, ForeignKey("customer_shipments.id"), nullable=False, index=True)
    po_line_id = Column(Integer, ForeignKey("po_lines.id"), nullable=False, index=True)
    lot_id = Column(Integer, ForeignKey("production_lots.id"), nullable=True, index=True)
    qty = Column(Numeric(18, 3), nullable=False)

    shipment = relationship("CustomerShipment", back_populates="items")
    po_line = relationship("POLine")
    lot = relationship("ProductionLot")


# ===== Customer Invoice =====
class CustomerInvoice(Base):
    __tablename__ = "customer_invoices"
    id = Column(Integer, primary_key=True)
    invoice_no = Column(String, unique=True, index=True, nullable=False)
    po_id = Column(Integer, ForeignKey("purchase_orders.id"), nullable=False, index=True)
    invoice_date = Column(Date, nullable=False, default=date.today)
    status = Column(String, nullable=False, default="open")  # open/paid/void
    notes = Column(Text)
    residual_inv = Column(Integer)

    po = relationship("PO", back_populates="invoices")
    lines = relationship("CustomerInvoiceLine", back_populates="invoice", cascade="all, delete-orphan")


class CustomerInvoiceLine(Base):
    __tablename__ = "customer_invoice_lines"
    id = Column(Integer, primary_key=True)
    invoice_id = Column(Integer, ForeignKey("customer_invoices.id"), nullable=False, index=True)
    po_line_id = Column(Integer, ForeignKey("po_lines.id"), nullable=False, index=True)
    shipment_item_id = Column(Integer, ForeignKey("customer_shipment_items.id"), nullable=True, index=True)
    qty = Column(Numeric(18, 3), nullable=False)
    unit_price = Column(Numeric(18, 2), nullable=True)
    amount = Column(Numeric(18, 2), nullable=True)

    invoice = relationship("CustomerInvoice", back_populates="lines")
    po_line = relationship("POLine")
    shipment_item = relationship("CustomerShipmentItem")


class CustomerReturn(Base):
    __tablename__ = "customer_returns"
    id = Column(Integer, primary_key=True)
    po_id = Column(Integer, ForeignKey("purchase_orders.id"), nullable=False, index=True)
    rma_no = Column(String, unique=True, index=True, nullable=True)
    returned_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    reason = Column(Text)
    status = Column(String, default="received", nullable=False)  # received/inspected/closed

    po = relationship("PO")


class CustomerReturnItem(Base):
    __tablename__ = "customer_return_items"
    id = Column(Integer, primary_key=True)
    return_id = Column(Integer, ForeignKey("customer_returns.id"), nullable=False, index=True)
    shipment_item_id = Column(Integer, ForeignKey("customer_shipment_items.id"), nullable=True, index=True)
    po_line_id = Column(Integer, ForeignKey("po_lines.id"), nullable=False, index=True)
    lot_id = Column(Integer, ForeignKey("production_lots.id"), nullable=True, index=True)

    qty = Column(Numeric(18, 3), nullable=False)
    reason_code = Column(String, nullable=True)   # DEFECT, WRONG_PART, DAMAGE, ...
    disposition = Column(String, nullable=True)   # REWORK, SCRAP, RETURN_TO_STOCK, CREDIT

    ret = relationship("CustomerReturn", backref="items")
    shipment_item = relationship("CustomerShipmentItem")
    po_line = relationship("POLine")
    lot = relationship("ProductionLot")


############ Selection ############

class ManufacturingProcess(Base):
    __tablename__ = "mfg_processes"
    id = Column(Integer, primary_key=True)
    code = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    category = Column(String, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)


class ChemicalFinish(Base):
    __tablename__ = "chemical_finishes"
    id = Column(Integer, primary_key=True)
    code = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)


class PartProcessSelection(Base):
    __tablename__ = "part_process_selections"

    id = Column(Integer, primary_key=True)

    part_id = Column(Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True)
    process_id = Column(Integer, ForeignKey("mfg_processes.id", ondelete="CASCADE"), nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    part = relationship("Part", back_populates="processes")
    process = relationship("ManufacturingProcess")

    __table_args__ = (
        UniqueConstraint("part_id", "process_id", name="uq_part_process"),
    )

    def __repr__(self):
        return f"<PartProcessSelection(part_id={self.part_id}, process_id={self.process_id})>"


class PartFinishSelection(Base):
    __tablename__ = "part_finish_selections"

    id = Column(Integer, primary_key=True)

    part_id = Column(Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True)
    finish_id = Column(Integer, ForeignKey("chemical_finishes.id", ondelete="CASCADE"), nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    part = relationship("Part", back_populates="finishes")
    finish = relationship("ChemicalFinish")

    __table_args__ = (
        UniqueConstraint("part_id", "finish_id", name="uq_part_finish"),
    )

    def __repr__(self):
        return f"<PartFinishSelection(part_id={self.part_id}, finish_id={self.finish_id})>"


class PartOtherNote(Base):
    __tablename__ = "part_other_notes"

    id = Column(Integer, primary_key=True)

    part_id = Column(Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True)
    category = Column(String, nullable=False)   # e.g. "PROCESS", "FINISH"
    note = Column(String, nullable=False)

    part = relationship("Part", back_populates="other_notes")

    def __repr__(self):
        return f"<PartOtherNote(part_id={self.part_id}, category={self.category}, note={self.note})>"


# =========================================
# ============== EVENT LISTENERS ==========
# =========================================
# (Declared AFTER classes they reference)

@event.listens_for(LotMaterialUse, "before_insert")
@event.listens_for(LotMaterialUse, "before_update")
def _lmu_sync_raw_material(mapper, connection, target: LotMaterialUse):
    """Ensure raw_material_id matches the batch's material each time."""
    if target.batch_id:
        rm_id = connection.execute(
            select(RawBatch.material_id).where(RawBatch.id == target.batch_id)
        ).scalar_one_or_none()
        target.raw_material_id = rm_id


@event.listens_for(RawBatch, "before_insert")
@event.listens_for(RawBatch, "before_update")
def _rawbatch_sync_po_from_line(mapper, connection, target: RawBatch):
    """Keep RawBatch.po_id and material_id in sync with selected MaterialPOLine (if any)."""
    if not target.material_po_line_id:
        return
    row = connection.execute(
        select(MaterialPOLine.po_id, MaterialPOLine.material_id)
        .where(MaterialPOLine.id == target.material_po_line_id)
    ).first()
    if not row:
        return
    po_id_from_line, mat_id_from_line = row
    target.po_id = po_id_from_line
    if mat_id_from_line and target.material_id != mat_id_from_line:
        target.material_id = mat_id_from_line


@event.listens_for(LotMaterialUse, "before_insert")
def _lmu_before_insert_guard(mapper, connection, target: LotMaterialUse):
    """Prevent using more than received; allow negative to represent returns but not below zero total."""
    total_used_other = connection.execute(
        select(func.coalesce(func.sum(LotMaterialUse.qty), 0)).where(LotMaterialUse.batch_id == target.batch_id)
    ).scalar_one()

    qty_received = connection.execute(
        select(func.coalesce(RawBatch.qty_received, 0)).where(RawBatch.id == target.batch_id)
    ).scalar_one()
    total_after = float(total_used_other or 0) + float(target.qty or 0)
    
    if total_after < 0:
        raise ValueError(f"batch {target.batch_id}: total_used would be {total_after} < 0")
    if total_after > (qty_received or 0):
        raise ValueError(
            f"batch {target.batch_id}: total_used would be {total_after} > qty_received {qty_received}"
        )

from decimal import Decimal   # ✅ เพิ่มตรงนี้
@event.listens_for(LotMaterialUse, "before_update")
def _lmu_before_update_guard(mapper, connection, target: LotMaterialUse):
    total_used_other = connection.execute(
        select(func.coalesce(func.sum(LotMaterialUse.qty), 0)).where(
            (LotMaterialUse.batch_id == target.batch_id) & (LotMaterialUse.id != target.id)
        )
    ).scalar_one()

    qty_received = connection.execute(
        select(func.coalesce(RawBatch.qty_received, 0)).where(RawBatch.id == target.batch_id)
    ).scalar_one()
    qty_value = getattr(target, "qty", 0)   # ✅ เพิ่มบรรทัดนี้
    total_after = Decimal(total_used_other or 0) + Decimal(qty_value or 0)
    if total_after < 0:
        raise ValueError(f"batch {target.batch_id}: total_used would be {total_after} < 0")
    if total_after > (qty_received or 0):
        raise ValueError(
            f"batch {target.batch_id}: total_used would be {total_after} > qty_received {qty_received}"
        )


# =========================================
# === Computed stock properties (read-only)
# === Put this AFTER LotMaterialUse class
# =========================================

# per-batch: used qty (sum from LotMaterialUse)
RawBatch.qty_used_calc = column_property(
    select(func.coalesce(func.sum(LotMaterialUse.qty), 0))
    .where(LotMaterialUse.batch_id == RawBatch.id)
    .correlate_except(LotMaterialUse)
    .scalar_subquery()
)

# per-batch: available = received - used
RawBatch.qty_available_calc = column_property(RawBatch.qty_received - RawBatch.qty_used_calc)

# material-level aggregates
_rb = aliased(RawBatch)
_lmu = aliased(LotMaterialUse)
_used_per_rb_subq = (
    select(func.coalesce(func.sum(_lmu.qty), 0))
    .where(_lmu.batch_id == _rb.id)
    .correlate_except(_lmu)
    .scalar_subquery()
)

RawMaterial.total_on_hand = column_property(
    select(func.coalesce(func.sum(_rb.qty_received - _used_per_rb_subq), 0))
    .where(_rb.material_id == RawMaterial.id)
    .correlate_except(_rb)
    .scalar_subquery()
)


from sqlalchemy import Integer, String, Column, UniqueConstraint

class DocCounter(Base):
    __tablename__ = "doc_counters"
    doc_type = Column(String, primary_key=True)   # "LOT", "TRV", ฯลฯ
    year = Column(Integer, primary_key=True)
    seq = Column(Integer, nullable=False, default=0)

    __table_args__ = (
        UniqueConstraint("doc_type", "year", name="uq_doc_counters_type_year"),
    )