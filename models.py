from sqlalchemy import (
    Column, Integer, String, Text, Date, DateTime, ForeignKey, UniqueConstraint, Index,
    Numeric, Boolean, CheckConstraint
)
from sqlalchemy.sql import func
from sqlalchemy.orm import validates, object_session
from sqlalchemy import ForeignKeyConstraint
from sqlalchemy.orm import relationship
from datetime import datetime, date, timezone
from database import Base


# =========================================
# =============== Master ==================
# =========================================

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

    def __repr__(self):
        return f"<Supplier(code={self.code}, name={self.name})>"


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
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)

    customer = relationship("Customer", back_populates="pos", foreign_keys=[customer_id])

    lines = relationship("POLine", back_populates="po", cascade="all, delete-orphan")
    shipments = relationship("CustomerShipment", back_populates="po", cascade="all, delete-orphan")
    invoices = relationship("CustomerInvoice", back_populates="po", cascade="all, delete-orphan")
    lots = relationship("ProductionLot", back_populates="po", cascade="all, delete-orphan", foreign_keys="ProductionLot.po_id")

    def __repr__(self):
        return f"<PO(po_number={self.po_number}, customer_id={self.customer_id})>"


class Employee(Base):
    __tablename__ = "employees"
    id = Column(Integer, primary_key=True, index=True)
    emp_code = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    # lastname = Column(String, nullable=False)
    position = Column(String, nullable=True)
    department = Column(String, nullable=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    status = Column(String, default="active")  # active / inactive

    user = relationship("User", back_populates="employee", uselist=False)

    def __repr__(self):
        return f"<Employee(emp_code={self.emp_code}, name={self.name})>"


# =========================================
# =========== Materials / Batches =========
# =========================================

class RawMaterial(Base):
    __tablename__ = "raw_materials"
    id = Column(Integer, primary_key=True)
    code = Column(String, unique=True, index=True, nullable=False)   # ex. AL6061-RND-20
    name = Column(String, nullable=False)                            # Aluminium 6061 Round Bar Ø20
    spec = Column(String, nullable=True)                             # AMS/ASTM/ISO
    uom = Column(String, default="kg")                               # หน่วยหลักที่เก็บสต็อก
    remark = Column(Text, nullable=True)

    batches = relationship("RawBatch", back_populates="material")

    def __repr__(self):
        return f"<RawMaterial(code={self.code}, name={self.name})>"


class RawBatch(Base):
    __tablename__ = "raw_batches"
    id = Column(Integer, primary_key=True)
    material_id = Column(Integer, ForeignKey("raw_materials.id"), nullable=False)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True)
    material_po_line_id = Column(Integer, ForeignKey("material_po_lines.id"), nullable=True)  # ✅

    batch_no = Column(String, index=True, nullable=False)            # หมายเลขล็อตจาก supplier
    supplier_batch_no = Column(String, nullable=True)
    mill_name = Column(String, nullable=True)
    mill_heat_no = Column(String, nullable=True)

    received_at = Column(Date, nullable=True)
    qty_received = Column(Numeric(18, 3), nullable=False, default=0)
    cert_file = Column(String, nullable=True)
    location = Column(String, nullable=True)

    material = relationship("RawMaterial", back_populates="batches")
    supplier = relationship("Supplier", back_populates="raw_batches")
    uses = relationship("LotMaterialUse", back_populates="batch")

    __table_args__ = (
        UniqueConstraint("material_id", "batch_no", "supplier_id", name="uq_batch_material_supplier"),
        Index("ix_raw_batches_mat_recv", "material_id", "received_at"),
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

    # NEW: inverse side for ProductionLot.part
    production_lots = relationship(
        "ProductionLot",
        back_populates="part",
        foreign_keys="ProductionLot.part_id",
    )

    # relationships (not columns)
    processes = relationship("PartProcessSelection", back_populates="part", cascade="all, delete-orphan")
    finishes  = relationship("PartFinishSelection", back_populates="part", cascade="all, delete-orphan")
    other_notes = relationship("PartOtherNote", back_populates="part", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Part(part_no={self.part_no})>"


class PartRevision(Base):
    __tablename__ = "part_revisions"

    id = Column(Integer, primary_key=True)
    part_id = Column(Integer, ForeignKey("parts.id"), nullable=False)
    rev = Column(String, nullable=False)
    drawing_file = Column(String)
    spec = Column(String)
    is_current = Column(Boolean, default=False)

    part = relationship("Part", back_populates="revisions", foreign_keys=[part_id])

    __table_args__ = (
        # ป้องกัน rev ซ้ำใน part เดียวกัน
        UniqueConstraint("part_id", "rev", name="uq_part_rev"),
        # ต้องมี (part_id, id) เป็น unique เพื่อรองรับ composite FK
        UniqueConstraint("part_id", "id", name="uq_part_id_id"),
    )

    # --- FAIR quick link/cache ---
    fair_record_id = Column(
        Integer,
        ForeignKey("inspection_records.id", ondelete="SET NULL"),
        nullable=True,
        unique=True
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



# =========================================
# ======== Production / Lot / Traveler ====
# =========================================

# models.py (เฉพาะส่วน ProductionLot)

class ProductionLot(Base):
    __tablename__ = "production_lots"

    id = Column(Integer, primary_key=True)
    lot_no = Column(String, unique=True, index=True, nullable=False)
    
    part_id = Column(Integer, ForeignKey("parts.id"), nullable=False)
    part_revision_id = Column(Integer, ForeignKey("part_revisions.id"), nullable=True, index=True)
    po_id = Column(Integer, ForeignKey("purchase_orders.id"), nullable=True, index=True)
    po_line_id = Column(Integer, ForeignKey("po_lines.id"), nullable=True, index=True)

    planned_qty = Column(Integer, nullable=False, default=0)
    started_at  = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    lot_due_date = Column(Date, nullable=True, index=True)
    status = Column(String, nullable=False, default="in_process")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    # CHANGED: add foreign_keys + back_populates
    part = relationship("Part", foreign_keys=[part_id], back_populates="production_lots")
    part_revision = relationship("PartRevision", foreign_keys=[part_revision_id], back_populates="production_lots")
    po = relationship("PO", back_populates="lots", foreign_keys=[po_id])
    po_line = relationship("POLine", foreign_keys=[po_line_id])
    material_uses = relationship("LotMaterialUse", back_populates="lot", cascade="all, delete-orphan")
    travelers = relationship("ShopTraveler", back_populates="lot", cascade="all, delete-orphan",
                             order_by="ShopTraveler.created_at.asc()")
    
    # --- FAIR link per lot (optional) ---
    fair_required = Column(Boolean, nullable=False, default=False, server_default="false")

    fair_record_id = Column(Integer, ForeignKey("inspection_records.id", ondelete="SET NULL"), nullable=True, index=True)
    fair_record = relationship(
        "InspectionRecord",
        foreign_keys=[fair_record_id],
        back_populates="fair_for_lot",   # NEW inverse
        uselist=False
    )


    @validates("po_line_id")
    def _on_set_po_line(self, key, v):
        sess = object_session(self)
        if v is None:
            return v
        pl = sess.get(POLine, v) if sess else None
        if not pl:
            return v
        # sync fields (เขียนทับให้ตรงกับ POLine เสมอ)
        self.po_id = pl.po_id
        self.part_id = pl.part_id
        self.part_revision_id = pl.revision_id
        return v
    def __repr__(self):
        return f"<ProductionLot(lot_no={self.lot_no}, status={self.status})>"


from sqlalchemy import (
    Column, Integer, ForeignKey, Numeric, Index, UniqueConstraint, CheckConstraint,
    select, func, event
)
from sqlalchemy.orm import relationship
from sqlalchemy.exc import IntegrityError

class LotMaterialUse(Base):
    __tablename__ = "lot_material_use"

    id       = Column(Integer, primary_key=True)
    lot_id   = Column(Integer, ForeignKey("production_lots.id"), nullable=False, index=True)
    batch_id = Column(Integer, ForeignKey("raw_batches.id"), nullable=False, index=True)
    qty      = Column(Numeric(18, 3), nullable=False)

    lot   = relationship("ProductionLot", back_populates="material_uses")
    batch = relationship("RawBatch", back_populates="uses")

    __table_args__ = (
    CheckConstraint("qty > 0", name="ck_lmu_qty_positive"),
    Index("ix_lmu_lot", "lot_id"),
    Index("ix_lmu_batch", "batch_id"),
)


    def __repr__(self):
        return f"<LotMaterialUse(lot_id={self.lot_id}, batch_id={self.batch_id}, qty={self.qty})>"


# ----------------------------
# ORM-level guards (before insert/update)
# ----------------------------


@event.listens_for(LotMaterialUse, "before_insert")
def _lmu_before_insert(mapper, connection, target: LotMaterialUse):
    # total_used_other = SUM(qty) ของ batch นี้ (ยังไม่มีแถวตัวเอง)
    total_used_other = connection.execute(
        select(func.coalesce(func.sum(LotMaterialUse.qty), 0))
        .where(LotMaterialUse.batch_id == target.batch_id)
    ).scalar_one()

    # qty_received ของ batch
    qty_received = connection.execute(
        select(func.coalesce(RawBatch.qty_received, 0))
        .where(RawBatch.id == target.batch_id)
    ).scalar_one()

    total_after = (total_used_other or 0) + (target.qty or 0)

    if total_after < 0:
        raise IntegrityError(
            "Return exceeds previously used",
            params=None,
            orig=ValueError(
                f"batch {target.batch_id}: total_used would be {total_after} < 0"
            ),
        )
    if total_after > (qty_received or 0):
        raise IntegrityError(
            "Consumption exceeds received",
            params=None,
            orig=ValueError(
                f"batch {target.batch_id}: total_used would be {total_after} > qty_received {qty_received}"
            ),
        )


@event.listens_for(LotMaterialUse, "before_update")
def _lmu_before_update(mapper, connection, target: LotMaterialUse):
    # รวมของ batch นี้ แต่ "ไม่รวม" แถวตัวเอง
    total_used_other = connection.execute(
        select(func.coalesce(func.sum(LotMaterialUse.qty), 0))
        .where(
            (LotMaterialUse.batch_id == target.batch_id) &
            (LotMaterialUse.id != target.id)
        )
    ).scalar_one()

    qty_received = connection.execute(
        select(func.coalesce(RawBatch.qty_received, 0))
        .where(RawBatch.id == target.batch_id)
    ).scalar_one()

    total_after = (total_used_other or 0) + (target.qty or 0)

    if total_after < 0:
        raise IntegrityError(
            "Return exceeds previously used",
            params=None,
            orig=ValueError(
                f"batch {target.batch_id}: total_used would be {total_after} < 0"
            ),
        )
    if total_after > (qty_received or 0):
        raise IntegrityError(
            "Consumption exceeds received",
            params=None,
            orig=ValueError(
                f"batch {target.batch_id}: total_used would be {total_after} > qty_received {qty_received}"
            ),
        )




class ShopTraveler(Base):
    __tablename__ = "shop_travelers"
    id = Column(Integer, primary_key=True)
    lot_id = Column(Integer, ForeignKey("production_lots.id"), nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    created_by_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    status = Column(String, nullable=False, default="open")
    notes = Column(Text, nullable=True)

    # ✅ NEW: production due date for this traveler
    production_due_date = Column(Date, nullable=True, index=True)

    lot = relationship("ProductionLot", back_populates="travelers")
    created_by = relationship("Employee", foreign_keys=[created_by_id])
    steps = relationship(
        "ShopTravelerStep",
        back_populates="traveler",
        cascade="all, delete-orphan",
        order_by="ShopTravelerStep.seq"
    )

    __table_args__ = (Index("ix_shop_travelers_status", "status"),)

    def __repr__(self):
        return f"<ShopTraveler(lot_id={self.lot_id}, status={self.status})>"



class ShopTravelerStep(Base):
    __tablename__ = "shop_traveler_steps"
    id = Column(Integer, primary_key=True)
    traveler_id = Column(Integer, ForeignKey("shop_travelers.id"), nullable=False)

    seq = Column(Integer, nullable=False)
    step_code = Column(String, nullable=True)
    step_name = Column(String, nullable=False)
    station = Column(String, nullable=True)

    status = Column(String, nullable=False, default="pending")
    started_at  = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)

    operator_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=True)

    qa_required = Column(Boolean, default=False, nullable=False)
    qa_result = Column(String, nullable=True)
    qa_notes = Column(Text, nullable=True)

    # ✅ ใหม่
    qty_receive = Column(Numeric(18, 3), nullable=False, default=0)  # (สะกด receive นะครับ)
    qty_accept  = Column(Numeric(18, 3), nullable=False, default=0)
    qty_reject  = Column(Numeric(18, 3), nullable=False, default=0)

    traveler = relationship("ShopTraveler", back_populates="steps")
    operator = relationship("Employee", foreign_keys=[operator_id])
    machine = relationship("Machine", back_populates="step_assignments")

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
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=False)
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
    order_id = Column(Integer, ForeignKey("subcon_orders.id"), nullable=False)
    traveler_step_id = Column(Integer, ForeignKey("shop_traveler_steps.id"), nullable=False)

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
    order_id = Column(Integer, ForeignKey("subcon_orders.id"), nullable=False)

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
    shipment_id = Column(Integer, ForeignKey("subcon_shipments.id"), nullable=False)
    traveler_step_id = Column(Integer, ForeignKey("shop_traveler_steps.id"), nullable=False)

    qty = Column(Numeric(18, 3), nullable=False, default=0)

    shipment = relationship("SubconShipment", back_populates="items")
    step = relationship("ShopTravelerStep")

    __table_args__ = (Index("ix_subcon_shipment_items_step", "traveler_step_id"),)

    def __repr__(self):
        return f"<SubconShipmentItem(shipment_id={self.shipment_id}, step_id={self.traveler_step_id}, qty={self.qty})>"


class SubconReceipt(Base):
    __tablename__ = "subcon_receipts"
    id = Column(Integer, primary_key=True)
    order_id = Column(Integer, ForeignKey("subcon_orders.id"), nullable=False)

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
    receipt_id = Column(Integer, ForeignKey("subcon_receipts.id"), nullable=False)
    traveler_step_id = Column(Integer, ForeignKey("shop_traveler_steps.id"), nullable=False)

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
    code = Column(String, unique=True, index=True, nullable=False)   # เช่น CNC-01
    name = Column(String, nullable=False)                            # เช่น HAAS VF-2
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
    traveler_step_id = Column(Integer, ForeignKey("shop_traveler_steps.id"), nullable=False)
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=False)
    priority = Column(Integer, nullable=True)  # 1 = แนะนำสุด

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
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=False)
    traveler_step_id = Column(Integer, ForeignKey("shop_traveler_steps.id"), nullable=False)

    planned_start = Column(DateTime(timezone=True), nullable=True)
    planned_end   = Column(DateTime(timezone=True), nullable=True)
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
    device_id = Column(Integer, ForeignKey("measurement_devices.id"), nullable=False)
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
    traveler_step_id = Column(Integer, ForeignKey("shop_traveler_steps.id"), nullable=False)

    is_fair = Column(Boolean, nullable=False, default=False)
    fair_no = Column(String, nullable=True)
    fair_doc_file = Column(String, nullable=True)
    fair_date = Column(Date, nullable=True)

    part_revision_id = Column(
        Integer,
        ForeignKey("part_revisions.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )

    # CHANGED: explicitly bind the FK and make it bidirectional
    part_revision = relationship(
        "PartRevision",
        foreign_keys=[part_revision_id],
        back_populates="inspection_records",
        passive_deletes=True,
    )

    inspector_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    device_id = Column(Integer, ForeignKey("measurement_devices.id"), nullable=True)
    started_at  = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    finished_at = Column(DateTime(timezone=True), nullable=True)


    overall_result = Column(String, nullable=True)
    notes = Column(Text, nullable=True)

    traveler_step = relationship("ShopTravelerStep", backref="inspection_records")
    inspector = relationship("Employee")
    device = relationship("MeasurementDevice")
    items = relationship("InspectionItem", back_populates="record", cascade="all, delete-orphan")

    # NEW: inverse of ProductionLot.fair_record (FK lives on ProductionLot)
    fair_for_lot = relationship(
        "ProductionLot",
        back_populates="fair_record",
        uselist=False,
        primaryjoin="InspectionRecord.id == ProductionLot.fair_record_id",
    )

    __table_args__ = (
        Index("ix_inspection_records_step", "traveler_step_id"),
        Index("ix_inspection_records_result", "overall_result"),
        Index("ix_inspection_records_fair_rev", "part_revision_id", "is_fair"),
    )

    def __repr__(self):
        return f"<InspectionRecord(step_id={self.traveler_step_id}, FAIR={self.is_fair}, result={self.overall_result})>"

    

class InspectionItem(Base):
    __tablename__ = "inspection_items"
    id = Column(Integer, primary_key=True)
    record_id = Column(Integer, ForeignKey("inspection_records.id"), nullable=False)

    characteristic = Column(String, nullable=False)
    nominal_value = Column(Numeric(18, 4), nullable=True)
    tol_lower = Column(Numeric(18, 4), nullable=True)
    tol_upper = Column(Numeric(18, 4), nullable=True)
    measured_value = Column(Numeric(18, 4), nullable=True)
    unit = Column(String, nullable=True)
    result = Column(String, nullable=True)               # pass / fail
    device_id = Column(Integer, ForeignKey("measurement_devices.id"), nullable=True)
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

    # สำคัญ: นิยามความสัมพันธ์ไปยังตารางเชื่อม พร้อม cascade และ passive_deletes
    user_roles = relationship(
        "UserRole",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    created_at    = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
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

    # ความสัมพันธ์กลับมาที่ตารางเชื่อม
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

    # ใส่ ondelete="CASCADE" ทั้งสองฝั่ง
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
    assigned_at = Column(DateTime, default=datetime.utcnow, nullable=False)

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




# def now_utc():
#     return datetime.now(timezone.utc)

class TimeEntry(Base):
    __tablename__ = "time_entries"

    id = Column(Integer, primary_key=True)

    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    payroll_emp_id = Column(Integer, ForeignKey("employees.id", ondelete="SET NULL"), nullable=True, index=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    work_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)

    # clock_in_at = Column(DateTime(timezone=True), default=now_utc, nullable=False)
    clock_in_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    clock_in_method = Column(String, nullable=True)
    clock_in_location = Column(String, nullable=True)

    clock_out_at = Column(DateTime(timezone=True), nullable=True)
    clock_out_method = Column(String, nullable=True)
    clock_out_location = Column(String, nullable=True)

    status = Column(String, nullable=False, default="open")
    notes = Column(Text, nullable=True)

    # CHANGED: make both Employee relationships explicit
    employee = relationship("Employee", foreign_keys=[employee_id])
    payroll_employee = relationship("Employee", foreign_keys=[payroll_emp_id])

    created_by_user = relationship("User", foreign_keys=[created_by_user_id])
    payroll_user = relationship("User", foreign_keys=[work_user_id])


    # ...ฟิลด์เดิม...
    pay_period_id = Column(Integer, ForeignKey("pay_periods.id"), index=True, nullable=True)
    pay_period    = relationship("PayPeriod", backref="time_entries")
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



# class BreakEntry(Base):
#     __tablename__ = "time_breaks"   # <-- เปลี่ยนชื่อใหม่
#     id = Column(Integer, primary_key=True)
#     time_entry_id = Column(Integer, ForeignKey("time_entries.id"), nullable=False, index=True)
#     break_type = Column(String, nullable=False, default="lunch")
#     start_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
#     end_at   = Column(DateTime(timezone=True))
#     method = Column(String)
#     location = Column(String)
#     notes = Column(Text)
#     is_paid = Column(Boolean, default=False, nullable=False)

#     time_entry = relationship("TimeEntry", backref="time_breaks")

#     __table_args__ = (
#         Index("ix_time_breaks_parent", "time_entry_id"),
#         Index("ix_time_breaks_start", "start_at"),
#         Index("ix_time_breaks_end", "end_at"),
#     )
class BreakEntry(Base): 
    __tablename__ = "break_entries" 
    id = Column(Integer, primary_key=True) 
    time_entry_id = Column(Integer, ForeignKey("time_entries.id"), nullable=False, index=True) 
    break_type = Column(String, nullable=False, default="lunch") # 👇 tz-aware & UTC 
    # start_at = Column(DateTime(timezone=True), nullable=False, default=now_utc) 
    start_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    end_at = Column(DateTime(timezone=True), nullable=True) 
    method = Column(String, nullable=True) 
    location = Column(String, nullable=True) 
    notes = Column(Text, nullable=True) 
    is_paid = Column(Boolean, nullable=False, default=False) 
    time_entry = relationship("TimeEntry", backref="breaks") 
    __table_args__ = ( Index("ix_break_entries_parent", "time_entry_id"), 
                      Index("ix_break_entries_start", "start_at"), 
                      Index("ix_break_entries_end", "end_at"), 
    )

class TimeLeave(Base):
    __tablename__ = "time_leaves"   # <-- ชื่อใหม่
    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    leave_type = Column(String, nullable=False)  # vacation/sick/...
    start_at = Column(DateTime(timezone=True), nullable=False)
    end_at   = Column(DateTime(timezone=True), nullable=False)
    hours    = Column(Numeric(5,2), nullable=True)
    is_paid  = Column(Boolean, nullable=False, default=True)
    status   = Column(String, nullable=False, default="approved")
    notes    = Column(Text)

    employee = relationship("Employee")

    __table_args__ = (Index("ix_time_leaves_emp_date", "employee_id", "start_at", "end_at"),)

class Holiday(Base):
    __tablename__ = "holidays"
    id = Column(Integer, primary_key=True)
    holiday_date = Column(Date, nullable=False, unique=True)
    name = Column(String, nullable=False)
    is_paid = Column(Boolean, nullable=False, default=True)
    hours = Column(Numeric(4,2), nullable=True)      # เช่น 8.0 ชม/วัน
    pay_multiplier = Column(Numeric(3,2), default=1) # ถ้ามีกฏจ่ายพิเศษ 1.5x/2x

class PayRate(Base):
    __tablename__ = "pay_rates"
    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), index=True, nullable=False)
    effective_from = Column(DateTime, nullable=False)
    hourly_rate = Column(Numeric(8,2), nullable=False)
    ot_multiplier = Column(Numeric(4,2), default=1.5)    # 1.5x
    dt_multiplier = Column(Numeric(4,2), default=2.0)    # 2.0x
    # optional: shift_diff, job_code, union_code, …
    # __table_args__ = (Index("ix_pay_rates_emp_eff", "employee_id", "effective_from"),)
    # ในโมเดล PayRate
    __table_args__ = (Index("ix_pay_rates_emp_eff", "employee_id", "effective_from"),
    # ไม่ให้ซ้ำวันเดียวกัน
    UniqueConstraint("employee_id", "effective_from", name="uq_pay_rates_emp_eff"),
    )


# models.py
class PayPeriod(Base):
    __tablename__ = "pay_periods"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=True)            # eg. "2025-W17", "2025-PP-08A"
    start_at = Column(DateTime(timezone=True), nullable=False)   # [start, end)
    end_at   = Column(DateTime(timezone=True), nullable=False)
    status   = Column(String, nullable=False, default="open")   # open/locked/paid
    anchor   = Column(String, nullable=True)        # optional: biweekly, weekly, monthly
    notes    = Column(Text, nullable=True)

    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    locked_by  = Column(Integer, ForeignKey("users.id"), nullable=True)
    locked_at = Column(DateTime(timezone=True), nullable=True)
    paid_at   = Column(DateTime(timezone=True), nullable=True)

     # ...ฟิลด์เดิม...
    created_by_emp_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    locked_by_emp_id  = Column(Integer, ForeignKey("employees.id"), nullable=True)
    paid_by_emp_id    = Column(Integer, ForeignKey("employees.id"), nullable=True)

    created_by_emp = relationship("Employee", foreign_keys=[created_by_emp_id])
    locked_by_emp  = relationship("Employee", foreign_keys=[locked_by_emp_id])
    paid_by_emp    = relationship("Employee", foreign_keys=[paid_by_emp_id])

    __table_args__ = (
        # กันช่วงงวดซ้อนกัน
        Index("ix_pay_periods_range", "start_at", "end_at"),
        # ไม่ให้มีช่วงเดียวกันซ้ำ
        UniqueConstraint("start_at", "end_at", name="uq_pay_periods_range"),
        CheckConstraint("end_at > start_at", name="ck_pay_periods_valid"),
    )

class POLine(Base):
    __tablename__ = "po_lines"

    id = Column(Integer, primary_key=True)
    po_id = Column(Integer, ForeignKey("purchase_orders.id"), nullable=False, index=True)
    part_id = Column(Integer, ForeignKey("parts.id"), nullable=False, index=True)
    # เอา FK เดี่ยวออก ใช้ composite FK คู่ด้านล่างแทน
    revision_id = Column(Integer, nullable=True, index=True)

    qty_ordered = Column(Numeric(18, 3), nullable=False)
    unit_price = Column(Numeric(18, 2))
    due_date = Column(Date)
    notes = Column(Text)

    po   = relationship("PO", back_populates="lines", foreign_keys=[po_id])
    part = relationship("Part", foreign_keys=[part_id])
    rev  = relationship("PartRevision", foreign_keys=[revision_id])

    __table_args__ = (
        Index("ix_po_lines_po", "po_id"),
        Index("ix_po_lines_part_rev", "part_id", "revision_id"),
        # Composite FK: บังคับ revision_id ต้องเป็นของ part_id นั้นจริง ๆ
        ForeignKeyConstraint(
            ["part_id", "revision_id"],
            ["part_revisions.part_id", "part_revisions.id"],
            name="fk_poline_part_rev_pair",
        ),
    )

    @validates("revision_id")
    def _validate_revision(self, key, rev_id):
        if rev_id is None:
            return rev_id  # อนุญาต legacy
        if not self.part_id:
            return rev_id  # จะตรวจอีกครั้งตอนตั้ง part_id
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
# ให้ lot อ้างบรรทัด PO ได้ (optional แต่ดีมาก)
# ProductionLot.po_line_id = Column(Integer, ForeignKey("po_lines.id"), nullable=True, index=True)

# ===== Customer Shipment =====
class CustomerShipment(Base):
    __tablename__ = "customer_shipments"
    id = Column(Integer, primary_key=True)
    po_id = Column(Integer, ForeignKey("purchase_orders.id"), nullable=False, index=True)
    shipped_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    ship_to = Column(String, nullable=True)
    carrier = Column(String, nullable=True)
    tracking_no = Column(String, nullable=True)
    notes = Column(Text)

    po = relationship("PO", back_populates="shipments")
    items = relationship("CustomerShipmentItem", back_populates="shipment", cascade="all, delete-orphan")

class CustomerShipmentItem(Base):
    __tablename__ = "customer_shipment_items"
    id = Column(Integer, primary_key=True)
    shipment_id = Column(Integer, ForeignKey("customer_shipments.id"), nullable=False, index=True)
    po_line_id = Column(Integer, ForeignKey("po_lines.id"), nullable=False, index=True)
    lot_id = Column(Integer, ForeignKey("production_lots.id"), nullable=True, index=True)  # ถ้าผูกกับ lot โดยตรง
    qty = Column(Numeric(18,3), nullable=False)

    shipment = relationship("CustomerShipment", back_populates="items")
    po_line  = relationship("POLine")
    lot      = relationship("ProductionLot")


# ===== Customer Invoice =====
class CustomerInvoice(Base):
    __tablename__ = "customer_invoices"
    id = Column(Integer, primary_key=True)
    invoice_no = Column(String, unique=True, index=True, nullable=False)
    po_id = Column(Integer, ForeignKey("purchase_orders.id"), nullable=False, index=True)
    invoice_date = Column(Date, nullable=False, default=date.today)
    status = Column(String, nullable=False, default="open")  # open/paid/void
    notes = Column(Text)

    po = relationship("PO", back_populates="invoices")
    lines = relationship("CustomerInvoiceLine", back_populates="invoice", cascade="all, delete-orphan")

class CustomerInvoiceLine(Base):
    __tablename__ = "customer_invoice_lines"
    id = Column(Integer, primary_key=True)
    invoice_id = Column(Integer, ForeignKey("customer_invoices.id"), nullable=False, index=True)
    po_line_id = Column(Integer, ForeignKey("po_lines.id"), nullable=False)
    shipment_item_id = Column(Integer, ForeignKey("customer_shipment_items.id"), nullable=True)  # ถ้าวางบิลตามของที่ส่ง
    qty = Column(Numeric(18,3), nullable=False)
    unit_price = Column(Numeric(18,2), nullable=True)
    amount = Column(Numeric(18,2), nullable=True)  # เก็บหรือคำนวณก็ได้

    invoice = relationship("CustomerInvoice", back_populates="lines")
    po_line = relationship("POLine")
    shipment_item = relationship("CustomerShipmentItem")


class MaterialPO(Base):
    __tablename__ = "material_pos"
    id = Column(Integer, primary_key=True)
    po_number = Column(String, unique=True, index=True, nullable=False)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=False)
    order_date = Column(Date, default=date.today, nullable=False)
    status = Column(String, default="open")  # open/confirmed/received/closed
    notes = Column(Text)

    supplier = relationship("Supplier")
    lines = relationship("MaterialPOLine", back_populates="po", cascade="all, delete-orphan")

class MaterialPOLine(Base):
    __tablename__ = "material_po_lines"
    id = Column(Integer, primary_key=True)
    po_id = Column(Integer, ForeignKey("material_pos.id"), nullable=False, index=True)
    material_id = Column(Integer, ForeignKey("raw_materials.id"), nullable=False)
    qty_ordered = Column(Numeric(18,3), nullable=False)
    unit_price = Column(Numeric(18,2), nullable=True)
    due_date = Column(Date, nullable=True)

    po = relationship("MaterialPO", back_populates="lines")
    material = relationship("RawMaterial")


class CustomerReturn(Base):
    __tablename__ = "customer_returns"
    id = Column(Integer, primary_key=True)
    po_id = Column(Integer, ForeignKey("purchase_orders.id"), nullable=False, index=True)
    rma_no = Column(String, unique=True, index=True, nullable=True)   # ถ้ามีเลข RMA
    returned_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    reason = Column(Text)
    status = Column(String, default="received")  # received/inspected/closed
    po = relationship("PO")

class CustomerReturnItem(Base):
    __tablename__ = "customer_return_items"
    id = Column(Integer, primary_key=True)
    return_id = Column(Integer, ForeignKey("customer_returns.id"), nullable=False, index=True)
    shipment_item_id = Column(Integer, ForeignKey("customer_shipment_items.id"), nullable=True, index=True)
    po_line_id = Column(Integer, ForeignKey("po_lines.id"), nullable=False, index=True)
    lot_id = Column(Integer, ForeignKey("production_lots.id"), nullable=True, index=True)

    qty = Column(Numeric(18,3), nullable=False)
    reason_code = Column(String, nullable=True)   # DEFECT, WRONG_PART, DAMAGE, ...
    disposition = Column(String, nullable=True)   # REWORK, SCRAP, RETURN_TO_STOCK, CREDIT

    ret = relationship("CustomerReturn", backref="items")
    shipment_item = relationship("CustomerShipmentItem")
    po_line = relationship("POLine")
    lot = relationship("ProductionLot")


############ Seclection 
class ManufacturingProcess(Base):
    __tablename__ = "mfg_processes"
    id   = Column(Integer, primary_key=True)
    code = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    category = Column(String, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

class ChemicalFinish(Base):
    __tablename__ = "chemical_finishes"
    id   = Column(Integer, primary_key=True)
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
# === Computed stock properties (read-only)
# === Put this AFTER LotMaterialUse class
# =========================================
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import column_property,aliased
from sqlalchemy import select, func

# --- ต่อ batch: ยอดใช้ไป (รวมจาก LotMaterialUse)
RawBatch.qty_used_calc = column_property(
    select(func.coalesce(func.sum(LotMaterialUse.qty), 0))
    .where(LotMaterialUse.batch_id == RawBatch.id)
    .correlate_except(LotMaterialUse)
    .scalar_subquery()
)

# --- ต่อ batch: คงเหลือ = qty_received - qty_used_calc
RawBatch.qty_available_calc = column_property(
    (RawBatch.qty_received - RawBatch.qty_used_calc)
)

# --- ระดับวัสดุ (รวมทุก batch)
rb  = aliased(RawBatch)
lmu = aliased(LotMaterialUse)

_used_per_rb_subq = (
    select(func.coalesce(func.sum(lmu.qty), 0))
    .where(lmu.batch_id == rb.id)
    .correlate_except(lmu)
    .scalar_subquery()
)

# on-hand รวมของวัสดุ = Σ (rb.qty_received - Σ lmu.qty ของ rb นั้น)
RawMaterial.total_on_hand = column_property(
    select(func.coalesce(func.sum(rb.qty_received - _used_per_rb_subq), 0))
    .where(rb.material_id == RawMaterial.id)
    .correlate_except(rb)
    .scalar_subquery()
)