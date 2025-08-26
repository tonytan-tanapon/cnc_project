from typing import Optional, Literal, List
from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, ConfigDict, Field

# ---------------------------
# Base config (Pydantic v2)
# ---------------------------
class APIBase(BaseModel):
    # from_attributes = True ให้แปลงจาก ORM ได้
    # Decimal -> float เพื่อส่ง JSON ได้สะดวก (ปรับตามความต้องการได้)
    model_config = ConfigDict(
        from_attributes=True,
        json_encoders={Decimal: float}
    )

# =========================================
# =============== Customers ===============
# =========================================

class CustomerBase(APIBase):
    code: str
    name: str
    contact: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None

class CustomerCreate(CustomerBase):
    pass

class CustomerUpdate(APIBase):
    name: Optional[str] = None
    contact: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None

class CustomerOut(CustomerBase):
    id: int


# =========================================
# ============ Purchase Orders ============
# =========================================

class POCreate(APIBase):
    po_number: str
    customer_id: int
    description: Optional[str] = None

class POUpdate(APIBase):
    po_number: Optional[str] = None
    customer_id: Optional[int] = None
    description: Optional[str] = None

class POOut(APIBase):
    id: int
    po_number: str
    customer_id: int
    description: Optional[str] = None


# =========================================
# ================ Employees ==============
# =========================================

class EmployeeBase(APIBase):
    emp_code: str
    name: str
    position: Optional[str] = None
    department: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    status: Optional[str] = "active"

class EmployeeCreate(EmployeeBase):
    pass

class EmployeeUpdate(APIBase):
    name: Optional[str] = None
    position: Optional[str] = None
    department: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    status: Optional[str] = None

class EmployeeOut(EmployeeBase):
    id: int


# =========================================
# ================= Suppliers =============
# =========================================

class SupplierCreate(APIBase):
    code: str
    name: str
    contact: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    payment_terms: Optional[str] = None

class SupplierUpdate(APIBase):
    name: Optional[str] = None
    contact: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    payment_terms: Optional[str] = None

class SupplierOut(APIBase):
    id: int
    code: str
    name: str
    contact: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    payment_terms: Optional[str] = None


# =========================================
# ============== Raw Materials ============
# =========================================

class RawMaterialCreate(APIBase):
    code: str
    name: str
    spec: Optional[str] = None
    uom: Optional[str] = "kg"
    remark: Optional[str] = None

class RawMaterialUpdate(APIBase):
    name: Optional[str] = None
    spec: Optional[str] = None
    uom: Optional[str] = None
    remark: Optional[str] = None

class RawMaterialOut(APIBase):
    id: int
    code: str
    name: str
    spec: Optional[str] = None
    uom: Optional[str] = None
    remark: Optional[str] = None


# =========================================
# ================= Raw Batches ===========
# =========================================

class RawBatchCreate(APIBase):
    material_id: int
    batch_no: str
    supplier_id: Optional[int] = None
    supplier_batch_no: Optional[str] = None
    mill_name: Optional[str] = None
    mill_heat_no: Optional[str] = None
    received_at: Optional[date] = None
    qty_received: Decimal = Field(..., gt=Decimal("0"))
    location: Optional[str] = None
    cert_file: Optional[str] = None

class RawBatchUpdate(APIBase):
    batch_no: Optional[str] = None
    supplier_id: Optional[int] = None
    supplier_batch_no: Optional[str] = None
    mill_name: Optional[str] = None
    mill_heat_no: Optional[str] = None
    received_at: Optional[date] = None
    qty_received: Optional[Decimal] = None
    location: Optional[str] = None
    cert_file: Optional[str] = None

class RawBatchOut(APIBase):
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


# =========================================
# ============== Production Lots ==========
# =========================================

LotStatus = Literal["planned", "in_process", "hold", "completed", "shipped", "canceled"]

class ProductionLotCreate(APIBase):
    lot_no: str
    part_id: int                 # ใช้ตรงกับ Model
    part_revision_id: Optional[int] = None
    po_id: Optional[int] = None
    planned_qty: int = 0
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    status: Optional[LotStatus] = "in_process"

class ProductionLotUpdate(APIBase):
    part_id: Optional[int] = None
    part_revision_id: Optional[int] = None
    po_id: Optional[int] = None
    planned_qty: Optional[int] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    status: Optional[LotStatus] = None

class ProductionLotOut(APIBase):
    id: int
    lot_no: str
    part_id: int
    part_revision_id: Optional[int] = None
    po_id: Optional[int] = None
    planned_qty: int
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    status: LotStatus
    # ดึงจาก property ใน ORM
    part_no: Optional[str] = None


# =========================================
# ============ Lot Material Use ===========
# =========================================

class LotMaterialUseCreate(APIBase):
    lot_id: int
    batch_id: int
    qty: Decimal = Field(..., gt=Decimal("0"))

class LotMaterialUseUpdate(APIBase):
    qty: Decimal = Field(..., gt=Decimal("0"))

class LotMaterialUseOut(APIBase):
    id: int
    lot_id: int
    batch_id: int
    qty: Decimal


# =========================================
# ============== Shop Traveler ============
# =========================================

TravelerStatus = Literal["open", "in_progress", "completed", "hold", "canceled"]

class ShopTravelerCreate(APIBase):
    lot_id: int
    created_by_id: Optional[int] = None
    notes: Optional[str] = None
    status: Optional[TravelerStatus] = "open"

class ShopTravelerUpdate(APIBase):
    created_by_id: Optional[int] = None
    notes: Optional[str] = None
    status: Optional[TravelerStatus] = None

class ShopTravelerOut(APIBase):
    id: int
    lot_id: int
    created_by_id: Optional[int] = None
    status: TravelerStatus
    notes: Optional[str] = None
    created_at: datetime


# --- Shop Traveler Steps ---

StepStatus = Literal["pending", "running", "passed", "failed", "skipped"]

class ShopTravelerStepCreate(APIBase):
    traveler_id: int
    seq: int
    step_name: str
    step_code: Optional[str] = None
    station: Optional[str] = None
    operator_id: Optional[int] = None
    qa_required: Optional[bool] = False

class ShopTravelerStepUpdate(APIBase):
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

class ShopTravelerStepOut(APIBase):
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


# =========================================
# ============== Subcontracting ===========
# =========================================

SubconOrderStatus = Literal["open", "confirmed", "shipped", "received", "closed", "cancelled"]
SubconShipmentStatus = Literal["shipped", "partially_received", "closed"]
SubconReceiptStatus = Literal["received", "partial", "rejected"]

# Orders
class SubconOrderLineIn(APIBase):
    traveler_step_id: int
    qty_planned: Decimal = Field(..., gt=Decimal("0"))
    unit_cost: Optional[Decimal] = None

class SubconOrderCreate(APIBase):
    supplier_id: int
    ref_no: Optional[str] = None
    due_date: Optional[date] = None
    notes: Optional[str] = None
    lines: List[SubconOrderLineIn]

class SubconOrderUpdate(APIBase):
    supplier_id: Optional[int] = None
    ref_no: Optional[str] = None
    due_date: Optional[date] = None
    notes: Optional[str] = None
    status: Optional[SubconOrderStatus] = None

class SubconOrderLineOut(APIBase):
    id: int
    order_id: int
    traveler_step_id: int
    qty_planned: Decimal
    unit_cost: Optional[Decimal] = None

class SubconOrderOut(APIBase):
    id: int
    supplier_id: int
    ref_no: Optional[str] = None
    status: SubconOrderStatus
    created_at: datetime
    due_date: Optional[date] = None
    notes: Optional[str] = None
    lines: List[SubconOrderLineOut] = []


# Shipments
class SubconShipmentItemIn(APIBase):
    traveler_step_id: int
    qty: Decimal = Field(..., gt=Decimal("0"))

class SubconShipmentCreate(APIBase):
    order_id: int
    shipped_at: Optional[datetime] = None
    shipped_by: Optional[str] = None
    package_no: Optional[str] = None
    carrier: Optional[str] = None
    tracking_no: Optional[str] = None
    items: List[SubconShipmentItemIn]

class SubconShipmentItemOut(APIBase):
    id: int
    shipment_id: int
    traveler_step_id: int
    qty: Decimal

class SubconShipmentOut(APIBase):
    id: int
    order_id: int
    shipped_at: datetime
    shipped_by: Optional[str] = None
    package_no: Optional[str] = None
    carrier: Optional[str] = None
    tracking_no: Optional[str] = None
    status: SubconShipmentStatus
    items: List[SubconShipmentItemOut] = []


# Receipts
class SubconReceiptItemIn(APIBase):
    traveler_step_id: int
    qty_received: Decimal = Field(..., ge=Decimal("0"))
    qty_rejected: Decimal = Field(default=Decimal("0"), ge=Decimal("0"))
    scrap_qty: Decimal = Field(default=Decimal("0"), ge=Decimal("0"))
    qa_result: Optional[str] = None
    qa_notes: Optional[str] = None

class SubconReceiptCreate(APIBase):
    order_id: int
    received_at: Optional[datetime] = None
    received_by: Optional[str] = None
    doc_no: Optional[str] = None
    items: List[SubconReceiptItemIn]

class SubconReceiptItemOut(APIBase):
    id: int
    receipt_id: int
    traveler_step_id: int
    qty_received: Decimal
    qty_rejected: Decimal
    scrap_qty: Decimal
    qa_result: Optional[str] = None
    qa_notes: Optional[str] = None

class SubconReceiptOut(APIBase):
    id: int
    order_id: int
    received_at: datetime
    received_by: Optional[str] = None
    doc_no: Optional[str] = None
    status: SubconReceiptStatus
    items: List[SubconReceiptItemOut] = []

#### Break Entries ####
class BreakEntryBase(BaseModel):
    break_type: str = "lunch"
    method: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None
    is_paid: bool = False  # <- เพิ่ม

class BreakEntryCreate(BreakEntryBase):
    time_entry_id: int
    start_at: Optional[datetime] = None  # ถ้าอยากให้ส่งเองได้

class BreakEntryOut(BreakEntryBase):
    id: int
    time_entry_id: int
    start_at: datetime
    end_at: Optional[datetime] = None
    class Config:
        from_attributes = True

# =========================
# ======== Leave ==========
# =========================

from typing import Optional, Annotated
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from pydantic import BaseModel, Field, model_validator, ConfigDict

# ชนิด Decimal แบบกำหนดจำนวนหลักทศนิยม
Decimal5_2 = Annotated[Decimal, Field(max_digits=5, decimal_places=2)]
Decimal4_2 = Annotated[Decimal, Field(max_digits=4, decimal_places=2)]
Decimal3_2 = Annotated[Decimal, Field(max_digits=3, decimal_places=2)]

class LeaveStatus(str, Enum):
    draft = "draft"
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    cancelled = "cancelled"

class LeaveType(str, Enum):
    vacation = "vacation"
    sick = "sick"
    personal = "personal"
    bereavement = "bereavement"
    unpaid = "unpaid"
    other = "other"

class LeaveEntryBase(BaseModel):
    leave_type: LeaveType = LeaveType.vacation
    notes: Optional[str] = None
    is_paid: bool = True
    # บางบริษัทเก็บชั่วโมงที่จ่ายตรง ๆ (รองรับ half-day)
    hours: Optional[Annotated[Decimal5_2, Field(ge=0, description="จำนวนชั่วโมงที่นับเป็นจ่าย (ถ้าระบุ)")]] = None
    status: LeaveStatus = LeaveStatus.approved

class LeaveEntryCreate(LeaveEntryBase):
    employee_id: int
    start_at: datetime
    end_at: datetime

    @model_validator(mode="after")
    def _validate_range(self):
        if self.end_at <= self.start_at:
            raise ValueError("end_at must be greater than start_at")
        return self

class LeaveEntryUpdate(BaseModel):
    # ใช้สำหรับ PATCH (แก้ทีละฟิลด์)
    leave_type: Optional[LeaveType] = None
    notes: Optional[str] = None
    is_paid: Optional[bool] = None
    hours: Optional[Annotated[Decimal5_2, Field(ge=0)]] = None
    status: Optional[LeaveStatus] = None
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None

    @model_validator(mode="after")
    def _validate_range(self):
        if self.start_at and self.end_at and self.end_at <= self.start_at:
            raise ValueError("end_at must be greater than start_at")
        return self

class LeaveEntryOut(LeaveEntryBase):
    id: int
    employee_id: int
    start_at: datetime
    end_at: datetime

    # Pydantic v2
    model_config = ConfigDict(from_attributes=True)


# =========================
# ======= Holiday =========
# =========================

class HolidayBase(BaseModel):
    name: str
    is_paid: bool = True
    # จำนวนชั่วโมงที่จ่ายในวันหยุด (เช่น 8.0), ไม่ใส่ = ใช้นโยบายดีฟอลต์
    hours: Optional[Annotated[Decimal4_2, Field(ge=0, le=24)]] = None
    # เผื่อกรณีจ่ายพิเศษ (1.5x / 2x) เมื่อทำงานในวันหยุด
    pay_multiplier: Optional[Annotated[Decimal3_2, Field(ge=1)]] = None
    notes: Optional[str] = None

class HolidayCreate(HolidayBase):
    holiday_date: date

class HolidayUpdate(BaseModel):
    name: Optional[str] = None
    is_paid: Optional[bool] = None
    hours: Optional[Annotated[Decimal4_2, Field(ge=0, le=24)]] = None
    pay_multiplier: Optional[Annotated[Decimal3_2, Field(ge=1)]] = None
    notes: Optional[str] = None
    holiday_date: Optional[date] = None  # เผื่อเลื่อนวัน

class HolidayOut(HolidayBase):
    id: int
    holiday_date: date

    # Pydantic v2
    model_config = ConfigDict(from_attributes=True)


# ========USER
from pydantic import BaseModel, EmailStr
from typing import Optional

class UserBase(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    is_active: Optional[bool] = None
    is_superuser: Optional[bool] = None
    employee_id: Optional[int] = None

class UserCreate(UserBase):
    username: str
    password: str

class UserUpdate(UserBase):
    pass

class UserOut(UserBase):
    id: int
    class Config:
        orm_mode = True

class SetPasswordIn(BaseModel):
    new_password: str

class AssignRoleIn(BaseModel):
    role_code: str

class RoleOut(BaseModel):
    id: int
    code: str
    name: str
    class Config:
        orm_mode = True

class PermissionOut(BaseModel):
    id: int
    code: str
    name: str
    class Config:
        orm_mode = True