from pydantic import BaseModel, Field
from typing import Optional, Literal, List
from datetime import date, datetime
from decimal import Decimal

# ---------------- Customers ----------------
class CustomerBase(BaseModel):
    code: Optional[str] = None   # เดิมอาจเป็น str
    name: str
    contact: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None

class CustomerCreate(CustomerBase):
    pass

class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    contact: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None

class CustomerOut(CustomerBase):
    id: int
    class Config:
        from_attributes = True


# ---------------- Purchase Orders ----------------
class POCreate(BaseModel):
    po_number: Optional[str] = None   # เดิมอาจเป็น str
    customer_id: int
    description: Optional[str] = None

class POUpdate(BaseModel):
    po_number: Optional[str] = None
    customer_id: Optional[int] = None
    description: Optional[str] = None

class POOut(BaseModel):
    id: int
    po_number: str
    customer_id: int
    description: Optional[str] = None
    class Config:
        from_attributes = True


# ---------------- Employees ----------------
class EmployeeBase(BaseModel):
    emp_code: Optional[str] = None
    name: str
    position: Optional[str] = None
    department: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    status: Optional[str] = "active"

class EmployeeCreate(EmployeeBase):
    pass

class EmployeeUpdate(BaseModel):
    name: Optional[str] = None
    position: Optional[str] = None
    department: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    status: Optional[str] = None

class EmployeeOut(EmployeeBase):
    id: int
    class Config:
        from_attributes = True


# ---------- Suppliers (ใหม่) ----------
class SupplierCreate(BaseModel):
    code: str
    name: str
    contact: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    payment_terms: Optional[str] = None

class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    contact: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    payment_terms: Optional[str] = None

class SupplierOut(BaseModel):
    id: int
    code: str
    name: str
    contact: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    payment_terms: Optional[str] = None
    class Config:
        from_attributes = True


# ---------- Raw Materials ----------
class RawMaterialCreate(BaseModel):
    code: str
    name: str
    spec: Optional[str] = None
    uom: Optional[str] = "kg"
    remark: Optional[str] = None

class RawMaterialUpdate(BaseModel):
    name: Optional[str] = None
    spec: Optional[str] = None
    uom: Optional[str] = None
    remark: Optional[str] = None

class RawMaterialOut(BaseModel):
    id: int
    code: str
    name: str
    spec: Optional[str] = None
    uom: Optional[str] = None
    remark: Optional[str] = None
    class Config:
        from_attributes = True


# ---------- Raw Batches (แก้ไขให้มาตรฐาน) ----------
class RawBatchCreate(BaseModel):
    material_id: int
    batch_no: str                                  # เลขล็อตจาก supplier
    supplier_id: Optional[int] = None              # FK -> Supplier (ถ้ามี)
    supplier_batch_no: Optional[str] = None        # เลขอ้างอิงภายในของ supplier
    mill_name: Optional[str] = None                # โรงหลอมต้นทาง
    mill_heat_no: Optional[str] = None             # Heat No. จากโรงหลอม
    received_at: Optional[date] = None
    qty_received: Decimal = Field(..., gt=Decimal("0"))
    location: Optional[str] = None
    cert_file: Optional[str] = None

class RawBatchUpdate(BaseModel):
    batch_no: Optional[str] = None
    supplier_id: Optional[int] = None
    supplier_batch_no: Optional[str] = None
    mill_name: Optional[str] = None
    mill_heat_no: Optional[str] = None
    received_at: Optional[date] = None
    qty_received: Optional[Decimal] = None
    location: Optional[str] = None
    cert_file: Optional[str] = None

class RawBatchOut(BaseModel):
    id: int
    material_id: int
    batch_no: str
    supplier_id: Optional[int] = None
    supplier_batch_no: Optional[str] = None
    mill_name: Optional[str] = None
    mill_heat_no: Optional[str] = None
    received_at: Optional[date] = None
    qty_received: Decimal
    qty_used: Decimal
    location: Optional[str] = None
    cert_file: Optional[str] = None
    class Config:
        from_attributes = True


# ---------- Production Lots ----------
LotStatus = Literal["planned", "in_process", "hold", "completed", "shipped", "canceled"]

class ProductionLotCreate(BaseModel):
    lot_no: str
    part_no: Optional[str] = None
    po_id: Optional[int] = None
    planned_qty: int = 0
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    status: Optional[LotStatus] = "in_process"

class ProductionLotUpdate(BaseModel):
    part_no: Optional[str] = None
    po_id: Optional[int] = None
    planned_qty: Optional[int] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    status: Optional[LotStatus] = None

class ProductionLotOut(BaseModel):
    id: int
    lot_no: str
    part_no: Optional[str] = None
    po_id: Optional[int] = None
    planned_qty: int
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    status: LotStatus
    class Config:
        from_attributes = True


# ---------- Lot Material Use ----------
class LotMaterialUseCreate(BaseModel):
    lot_id: int
    batch_id: int
    qty: Decimal = Field(..., gt=Decimal("0"))

class LotMaterialUseUpdate(BaseModel):
    qty: Decimal = Field(..., gt=Decimal("0"))  # เปลี่ยนปริมาณ (จะคำนวณ delta ให้)

class LotMaterialUseOut(BaseModel):
    id: int
    lot_id: int
    batch_id: int
    qty: Decimal
    class Config:
        from_attributes = True


# ---------- Shop Traveler ----------
TravelerStatus = Literal["open", "in_progress", "completed", "hold", "canceled"]

class ShopTravelerCreate(BaseModel):
    lot_id: int
    created_by_id: Optional[int] = None
    notes: Optional[str] = None
    status: Optional[TravelerStatus] = "open"

class ShopTravelerUpdate(BaseModel):
    created_by_id: Optional[int] = None
    notes: Optional[str] = None
    status: Optional[TravelerStatus] = None

class ShopTravelerOut(BaseModel):
    id: int
    lot_id: int
    created_by_id: Optional[int] = None
    status: TravelerStatus
    notes: Optional[str] = None
    created_at: datetime
    class Config:
        from_attributes = True


# --- Shop Traveler Steps ---
StepStatus = Literal["pending", "running", "passed", "failed", "skipped"]

class ShopTravelerStepCreate(BaseModel):
    traveler_id: int
    seq: int
    step_name: str
    step_code: Optional[str] = None
    station: Optional[str] = None
    operator_id: Optional[int] = None
    qa_required: Optional[bool] = False

class ShopTravelerStepUpdate(BaseModel):
    seq: Optional[int] = None
    step_name: Optional[str] = None
    step_code: Optional[str] = None
    station: Optional[str] = None
    operator_id: Optional[int] = None
    qa_required: Optional[bool] = None
    status: Optional[StepStatus] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    qa_result: Optional[str] = None
    qa_notes: Optional[str] = None

class ShopTravelerStepOut(BaseModel):
    id: int
    traveler_id: int
    seq: int
    step_name: str
    step_code: Optional[str] = None
    station: Optional[str] = None
    operator_id: Optional[int] = None
    status: StepStatus
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    qa_required: bool
    qa_result: Optional[str] = None
    qa_notes: Optional[str] = None
    class Config:
        from_attributes = True


# ---------- Subcontracting (ใหม่ตามมาตรฐาน) ----------
SubconOrderStatus = Literal["open", "confirmed", "shipped", "received", "closed", "cancelled"]
SubconShipmentStatus = Literal["shipped", "partially_received", "closed"]
SubconReceiptStatus = Literal["received", "partial", "rejected"]

class SubconOrderLineIn(BaseModel):
    traveler_step_id: int
    qty_planned: Decimal = Field(..., gt=Decimal("0"))
    unit_cost: Optional[Decimal] = None

class SubconOrderCreate(BaseModel):
    supplier_id: int
    ref_no: Optional[str] = None
    due_date: Optional[date] = None
    notes: Optional[str] = None
    lines: List[SubconOrderLineIn]

class SubconOrderUpdate(BaseModel):
    supplier_id: Optional[int] = None
    ref_no: Optional[str] = None
    due_date: Optional[date] = None
    notes: Optional[str] = None
    status: Optional[SubconOrderStatus] = None

class SubconOrderLineOut(BaseModel):
    id: int
    order_id: int
    traveler_step_id: int
    qty_planned: Decimal
    unit_cost: Optional[Decimal] = None
    class Config:
        from_attributes = True

class SubconOrderOut(BaseModel):
    id: int
    supplier_id: int
    ref_no: Optional[str] = None
    status: SubconOrderStatus
    created_at: datetime
    due_date: Optional[date] = None
    notes: Optional[str] = None
    lines: List[SubconOrderLineOut] = []
    class Config:
        from_attributes = True


# Shipments
class SubconShipmentItemIn(BaseModel):
    traveler_step_id: int
    qty: Decimal = Field(..., gt=Decimal("0"))

class SubconShipmentCreate(BaseModel):
    order_id: int
    shipped_at: Optional[datetime] = None
    shipped_by: Optional[str] = None
    package_no: Optional[str] = None
    carrier: Optional[str] = None
    tracking_no: Optional[str] = None
    items: List[SubconShipmentItemIn]

class SubconShipmentItemOut(BaseModel):
    id: int
    shipment_id: int
    traveler_step_id: int
    qty: Decimal
    class Config:
        from_attributes = True

class SubconShipmentOut(BaseModel):
    id: int
    order_id: int
    shipped_at: datetime
    shipped_by: Optional[str] = None
    package_no: Optional[str] = None
    carrier: Optional[str] = None
    tracking_no: Optional[str] = None
    status: SubconShipmentStatus
    items: List[SubconShipmentItemOut] = []
    class Config:
        from_attributes = True


# Receipts
class SubconReceiptItemIn(BaseModel):
    traveler_step_id: int
    qty_received: Decimal = Field(..., ge=Decimal("0"))
    qty_rejected: Decimal = Field(default=Decimal("0"), ge=Decimal("0"))
    scrap_qty: Decimal = Field(default=Decimal("0"), ge=Decimal("0"))
    qa_result: Optional[str] = None
    qa_notes: Optional[str] = None

class SubconReceiptCreate(BaseModel):
    order_id: int
    received_at: Optional[datetime] = None
    received_by: Optional[str] = None
    doc_no: Optional[str] = None
    items: List[SubconReceiptItemIn]

class SubconReceiptItemOut(BaseModel):
    id: int
    receipt_id: int
    traveler_step_id: int
    qty_received: Decimal
    qty_rejected: Decimal
    scrap_qty: Decimal
    qa_result: Optional[str] = None
    qa_notes: Optional[str] = None
    class Config:
        from_attributes = True

class SubconReceiptOut(BaseModel):
    id: int
    order_id: int
    received_at: datetime
    received_by: Optional[str] = None
    doc_no: Optional[str] = None
    status: SubconReceiptStatus
    items: List[SubconReceiptItemOut] = []
    class Config:
        from_attributes = True
