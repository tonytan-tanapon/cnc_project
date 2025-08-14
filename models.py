from sqlalchemy import (
    Column, Integer, String, Text, Date, DateTime, ForeignKey, UniqueConstraint, Index,
    Numeric, Boolean, Index
)
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

# =============== Master ===============

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

    # reverse relations (optional)
    raw_batches = relationship("RawBatch", back_populates="supplier")

# =============== Customer / PO ===============

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

class PO(Base):
    __tablename__ = "purchase_orders"
    id = Column(Integer, primary_key=True, index=True)
    po_number = Column(String, unique=True, index=True, nullable=False)
    description = Column(String, nullable=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)

    customer = relationship("Customer", back_populates="pos")
    lots = relationship("ProductionLot", back_populates="po", cascade="all, delete-orphan")

# =============== Employee ===============

class Employee(Base):
    __tablename__ = "employees"
    id = Column(Integer, primary_key=True, index=True)
    emp_code = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    position = Column(String, nullable=True)
    department = Column(String, nullable=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    status = Column(String, default="active")  # active / inactive

# =============== Materials / Batches ===============

class RawMaterial(Base):
    __tablename__ = "raw_materials"
    id = Column(Integer, primary_key=True)
    code = Column(String, unique=True, index=True, nullable=False)   # ex. AL6061-RND-20
    name = Column(String, nullable=False)                            # Aluminium 6061 Round Bar Ø20
    spec = Column(String, nullable=True)                             # AMS/ASTM/ISO
    uom = Column(String, default="kg")                               # หน่วยหลักที่เก็บสต็อก
    remark = Column(Text, nullable=True)

    batches = relationship("RawBatch", back_populates="material")

class RawBatch(Base):
    __tablename__ = "raw_batches"
    id = Column(Integer, primary_key=True)
    material_id = Column(Integer, ForeignKey("raw_materials.id"), nullable=False)

    # อ้าง supplier เป็น FK (มาตรฐานขึ้น, ไม่เก็บเป็น string ลอย ๆ)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True)

    # Traceability เพิ่มเติม
    batch_no = Column(String, index=True, nullable=False)            # หมายเลขล็อต/แบทช์ (จาก supplier)
    supplier_batch_no = Column(String, nullable=True)                # ถ้า supplier มีเลขอ้างอิงภายใน
    mill_name = Column(String, nullable=True)                        # โรงหลอมต้นทาง
    mill_heat_no = Column(String, nullable=True)                     # Heat No. จากโรงหลอม

    received_at = Column(Date, nullable=True)
    qty_received = Column(Numeric(18,3), nullable=False, default=0)
    qty_used = Column(Numeric(18,3), nullable=False, default=0)      # สะสมที่ใช้ไป
    cert_file = Column(String, nullable=True)                        # path COC/MTC
    location = Column(String, nullable=True)

    material = relationship("RawMaterial", back_populates="batches")
    supplier = relationship("Supplier", back_populates="raw_batches")
    uses = relationship("LotMaterialUse", back_populates="batch")

    __table_args__ = (
        # ป้องกันซ้ำในบริบทเดียวกัน (ปรับตามธุรกิจจริง)
        UniqueConstraint("material_id", "batch_no", "supplier_id", name="uq_batch_material_supplier"),
        Index("ix_raw_batches_mat_recv", "material_id", "received_at"),
    )

# =============== Production / Lot / Traveler ===============

class ProductionLot(Base):
    __tablename__ = "production_lots"
    id = Column(Integer, primary_key=True)
    lot_no = Column(String, unique=True, index=True, nullable=False)
    part_no = Column(String, nullable=True)
    po_id = Column(Integer, ForeignKey("purchase_orders.id"), nullable=True)
    planned_qty = Column(Integer, nullable=False, default=0)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    status = Column(String, nullable=False, default="in_process")

    po = relationship("PO", back_populates="lots")
    material_uses = relationship("LotMaterialUse", back_populates="lot", cascade="all, delete-orphan")
    traveler = relationship("ShopTraveler", back_populates="lot", uselist=False, cascade="all, delete-orphan")

class LotMaterialUse(Base):
    __tablename__ = "lot_material_use"
    id = Column(Integer, primary_key=True)
    lot_id = Column(Integer, ForeignKey("production_lots.id"), nullable=False)
    batch_id = Column(Integer, ForeignKey("raw_batches.id"), nullable=False)
    qty = Column(Numeric(18,3), nullable=False)  # แนะนำ Numeric

    lot = relationship("ProductionLot", back_populates="material_uses")
    batch = relationship("RawBatch", back_populates="uses")

    __table_args__ = (
        # ถ้าอยากรวมแถวซ้ำให้บังคับ unique คู่ lot-batch
        # UniqueConstraint("lot_id", "batch_id", name="uq_lot_batch"),
        Index("ix_lmu_lot", "lot_id"),
        Index("ix_lmu_batch", "batch_id"),
    )

class ShopTraveler(Base):
    __tablename__ = "shop_travelers"
    id = Column(Integer, primary_key=True)
    lot_id = Column(Integer, ForeignKey("production_lots.id"), nullable=False, unique=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    created_by_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    status = Column(String, nullable=False, default="open")   # open / in_progress / completed / hold / canceled
    notes = Column(Text, nullable=True)

    lot = relationship("ProductionLot", back_populates="traveler")
    created_by = relationship("Employee", foreign_keys=[created_by_id])
    steps = relationship("ShopTravelerStep", back_populates="traveler", cascade="all, delete-orphan",
                         order_by="ShopTravelerStep.seq")

    __table_args__ = (Index("ix_shop_travelers_status", "status"),)

class ShopTravelerStep(Base):
    __tablename__ = "shop_traveler_steps"
    id = Column(Integer, primary_key=True)
    traveler_id = Column(Integer, ForeignKey("shop_travelers.id"), nullable=False)

    seq = Column(Integer, nullable=False)
    step_code = Column(String, nullable=True)
    step_name = Column(String, nullable=False)
    station = Column(String, nullable=True)

    status = Column(String, nullable=False, default="pending")
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)

    operator_id = Column(Integer, ForeignKey("employees.id"), nullable=True)

    # 👇 เพิ่มฟิลด์เครื่องที่ใช้จริง
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=True)

    qa_required = Column(Boolean, default=False, nullable=False)
    qa_result = Column(String, nullable=True)
    qa_notes = Column(Text, nullable=True)

    traveler = relationship("ShopTraveler", back_populates="steps")
    operator = relationship("Employee", foreign_keys=[operator_id])
    machine = relationship("Machine", back_populates="step_assignments")

    __table_args__ = (
        UniqueConstraint("traveler_id", "seq", name="uq_traveler_seq"),
        Index("ix_traveler_steps_status", "status"),
        Index("ix_traveler_steps_operator", "operator_id"),
        Index("ix_traveler_steps_machine", "machine_id"),
    )


# =============== Subcontracting (มาตรฐาน) ===============

class SubconOrder(Base):
    __tablename__ = "subcon_orders"
    id = Column(Integer, primary_key=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=False)
    ref_no = Column(String, nullable=True)              # เลขอ้างอิงภายใน/กับ supplier
    status = Column(String, nullable=False, default="open")  # open/confirmed/shipped/received/closed/cancelled
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    due_date = Column(Date, nullable=True)
    notes = Column(Text, nullable=True)

    supplier = relationship("Supplier")
    lines = relationship("SubconOrderLine", back_populates="order", cascade="all, delete-orphan")
    shipments = relationship("SubconShipment", back_populates="order", cascade="all, delete-orphan")
    receipts = relationship("SubconReceipt", back_populates="order", cascade="all, delete-orphan")

    __table_args__ = (Index("ix_subcon_orders_supplier_status", "supplier_id", "status"),)

class SubconOrderLine(Base):
    __tablename__ = "subcon_order_lines"
    id = Column(Integer, primary_key=True)
    order_id = Column(Integer, ForeignKey("subcon_orders.id"), nullable=False)

    # ผูกกับขั้นตอนที่ส่งออกไปทำ
    traveler_step_id = Column(Integer, ForeignKey("shop_traveler_steps.id"), nullable=False)

    qty_planned = Column(Numeric(18,3), nullable=False, default=0)
    unit_cost = Column(Numeric(18,2), nullable=True)        # ถ้าต้องคิดต้นทุนต่อชิ้น/ต่อขั้น

    order = relationship("SubconOrder", back_populates="lines")
    step = relationship("ShopTravelerStep")

    __table_args__ = (
        UniqueConstraint("order_id", "traveler_step_id", name="uq_order_step"),
        Index("ix_subcon_order_lines_step", "traveler_step_id"),
    )

class SubconShipment(Base):
    __tablename__ = "subcon_shipments"
    id = Column(Integer, primary_key=True)
    order_id = Column(Integer, ForeignKey("subcon_orders.id"), nullable=False)

    shipped_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    shipped_by = Column(String, nullable=True)
    package_no = Column(String, nullable=True)
    carrier = Column(String, nullable=True)
    tracking_no = Column(String, nullable=True)
    status = Column(String, nullable=False, default="shipped")  # shipped/partially_received/closed

    order = relationship("SubconOrder", back_populates="shipments")
    items = relationship("SubconShipmentItem", back_populates="shipment", cascade="all, delete-orphan")

class SubconShipmentItem(Base):
    __tablename__ = "subcon_shipment_items"
    id = Column(Integer, primary_key=True)
    shipment_id = Column(Integer, ForeignKey("subcon_shipments.id"), nullable=False)
    traveler_step_id = Column(Integer, ForeignKey("shop_traveler_steps.id"), nullable=False)

    qty = Column(Numeric(18,3), nullable=False, default=0)

    shipment = relationship("SubconShipment", back_populates="items")
    step = relationship("ShopTravelerStep")

    __table_args__ = (
        Index("ix_subcon_shipment_items_step", "traveler_step_id"),
    )

class SubconReceipt(Base):
    __tablename__ = "subcon_receipts"
    id = Column(Integer, primary_key=True)
    order_id = Column(Integer, ForeignKey("subcon_orders.id"), nullable=False)

    received_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    received_by = Column(String, nullable=True)
    doc_no = Column(String, nullable=True)  # ใบรับของ/เอกสารอ้างอิง
    status = Column(String, nullable=False, default="received")  # received/partial/rejected

    order = relationship("SubconOrder", back_populates="receipts")
    items = relationship("SubconReceiptItem", back_populates="receipt", cascade="all, delete-orphan")

class SubconReceiptItem(Base):
    __tablename__ = "subcon_receipt_items"
    id = Column(Integer, primary_key=True)
    receipt_id = Column(Integer, ForeignKey("subcon_receipts.id"), nullable=False)
    traveler_step_id = Column(Integer, ForeignKey("shop_traveler_steps.id"), nullable=False)

    qty_received = Column(Numeric(18,3), nullable=False, default=0)
    qty_rejected = Column(Numeric(18,3), nullable=False, default=0)
    scrap_qty = Column(Numeric(18,3), nullable=False, default=0)
    qa_result = Column(String, nullable=True)   # pass/fail/partial
    qa_notes = Column(Text, nullable=True)

    receipt = relationship("SubconReceipt", back_populates="items")
    step = relationship("ShopTravelerStep")

    __table_args__ = (
        Index("ix_subcon_receipt_items_step", "traveler_step_id"),
    )


# =============== Machines ===============

class Machine(Base):
    __tablename__ = "machines"
    id = Column(Integer, primary_key=True)
    code = Column(String, unique=True, index=True, nullable=False)   # เช่น CNC-01
    name = Column(String, nullable=False)                            # เช่น HAAS VF-2
    type = Column(String, nullable=True)                             # CNC_MILL / CNC_LATHE / DRILL / EDM ...
    controller = Column(String, nullable=True)                       # FANUC / HAAS / SIEMENS ...
    axis_count = Column(Integer, nullable=True)                      # 3 / 4 / 5
    spindle_power_kw = Column(Numeric(10,3), nullable=True)
    max_travel_x = Column(Numeric(10,3), nullable=True)              # mm หรือนิ้ว ตามระบบ
    max_travel_y = Column(Numeric(10,3), nullable=True)
    max_travel_z = Column(Numeric(10,3), nullable=True)
    location = Column(String, nullable=True)                         # โซน/แถวในโรงงาน
    status = Column(String, nullable=False, default="available")     # available / busy / maintenance / down / offline
    notes = Column(Text, nullable=True)

    # reverse relations
    step_assignments = relationship("ShopTravelerStep", back_populates="machine")
    schedules = relationship("MachineSchedule", back_populates="machine", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_machines_status", "status"),
        Index("ix_machines_type_status", "type", "status"),
    )

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

class MachineSchedule(Base):
    __tablename__ = "machine_schedule"
    id = Column(Integer, primary_key=True)
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=False)
    traveler_step_id = Column(Integer, ForeignKey("shop_traveler_steps.id"), nullable=False)

    planned_start = Column(DateTime, nullable=True)
    planned_end = Column(DateTime, nullable=True)
    status = Column(String, nullable=False, default="scheduled")  # scheduled/started/completed/cancelled

    machine = relationship("Machine", back_populates="schedules")
    step = relationship("ShopTravelerStep", backref="machine_schedules")

    __table_args__ = (
        UniqueConstraint("machine_id", "traveler_step_id", name="uq_machine_step_once"),
        Index("ix_machine_schedule_machine", "machine_id", "planned_start"),
    )


# =============== Measurement / QA Devices ===============

class MeasurementDevice(Base):
    __tablename__ = "measurement_devices"
    id = Column(Integer, primary_key=True)
    code = Column(String, unique=True, index=True, nullable=False)  # ex. CMM-01, HG-002
    name = Column(String, nullable=False)                           # ex. Mitutoyo CMM, Height Gauge 600mm
    type = Column(String, nullable=True)                            # CMM / HEIGHT_GAUGE / MICROMETER / CALIPER / ROUGHNESS / VISION / OTHER
    brand = Column(String, nullable=True)
    model = Column(String, nullable=True)
    serial_no = Column(String, nullable=True)
    location = Column(String, nullable=True)                        # เก็บที่ไหน/แผนก
    status = Column(String, nullable=False, default="available")    # available / in_use / maintenance / out_of_calibration
    calibration_due = Column(Date, nullable=True)                   # วันครบกำหนดคาลิเบรต
    notes = Column(Text, nullable=True)

    calibrations = relationship("DeviceCalibration", back_populates="device", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_measurement_devices_status", "status"),
        Index("ix_measurement_devices_type", "type"),
        Index("ix_measurement_devices_cal_due", "calibration_due"),
    )


class DeviceCalibration(Base):
    __tablename__ = "device_calibrations"
    id = Column(Integer, primary_key=True)
    device_id = Column(Integer, ForeignKey("measurement_devices.id"), nullable=False)
    calibrated_at = Column(Date, nullable=False)
    due_at = Column(Date, nullable=True)
    performed_by = Column(String, nullable=True)     # บริษัท/แผนกที่คาลิเบรต
    result = Column(String, nullable=True)           # pass / fail
    certificate_file = Column(String, nullable=True) # path เอกสารคาลิเบรต (PDF/JPG)

    device = relationship("MeasurementDevice", back_populates="calibrations")

    __table_args__ = (
        Index("ix_device_calibrations_device", "device_id", "calibrated_at"),
    )

# =============== Inspection Records (QA per Step) ===============

class InspectionRecord(Base):
    __tablename__ = "inspection_records"
    id = Column(Integer, primary_key=True)
    traveler_step_id = Column(Integer, ForeignKey("shop_traveler_steps.id"), nullable=False)

    # ใครตรวจ/ตรวจเมื่อไหร่
    inspector_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    device_id = Column(Integer, ForeignKey("measurement_devices.id"), nullable=True)  # อุปกรณ์หลักที่ใช้ (ถ้ามี)
    started_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    finished_at = Column(DateTime, nullable=True)

    overall_result = Column(String, nullable=True)   # pass / fail / partial
    notes = Column(Text, nullable=True)

    traveler_step = relationship("ShopTravelerStep", backref="inspection_records")
    inspector = relationship("Employee")
    device = relationship("MeasurementDevice")
    items = relationship("InspectionItem", back_populates="record", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_inspection_records_step", "traveler_step_id"),
        Index("ix_inspection_records_result", "overall_result"),
    )


class InspectionItem(Base):
    __tablename__ = "inspection_items"
    id = Column(Integer, primary_key=True)
    record_id = Column(Integer, ForeignKey("inspection_records.id"), nullable=False)

    characteristic = Column(String, nullable=False)      # ชื่อจุดวัด เช่น "OD Ø20.00", "Length 100.00", "Ra"
    nominal_value = Column(Numeric(18, 4), nullable=True)
    tol_lower = Column(Numeric(18, 4), nullable=True)    # ค่าต่ำสุดที่ยอมรับได้ (เช่น -0.010)
    tol_upper = Column(Numeric(18, 4), nullable=True)    # ค่าสูงสุดที่ยอมรับได้ (เช่น +0.010)
    measured_value = Column(Numeric(18, 4), nullable=True)
    unit = Column(String, nullable=True)                 # mm / in / µm
    result = Column(String, nullable=True)               # pass / fail
    device_id = Column(Integer, ForeignKey("measurement_devices.id"), nullable=True)  # ถ้าวัดรายการนี้ด้วยอุปกรณ์เฉพาะ
    attachment = Column(String, nullable=True)           # path รูป/รายงานย่อย

    record = relationship("InspectionRecord", back_populates="items")
    device = relationship("MeasurementDevice")

    __table_args__ = (
        Index("ix_inspection_items_record", "record_id"),
        Index("ix_inspection_items_result", "result"),
    )
