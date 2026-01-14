from __future__ import annotations

from typing import Optional, Literal, List, Annotated
from datetime import date, datetime
from decimal import Decimal
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, model_validator

# =========================
# ===== Base (Pydantic v2)
# =========================
class APIBase(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        json_encoders={Decimal: float},  # จะคงไว้ก็ได้
    )

    # เพิ่มตัวนี้เพื่อ serialize Decimal -> str (แม่นกว่า float และไม่เสีย precision)
    from pydantic import field_serializer

    @field_serializer('*', check_fields=False)
    def _ser_decimal_any(self, v, _info):
        if isinstance(v, Decimal):
            # จะคืน str หรือ float ก็ได้ เลือกอย่างใดอย่างหนึ่ง
            return str(v)   # แนะนำ str เพื่อลด precision loss
        return v


# =========================================
# =============== Customers ===============
# =========================================
class CustomerBase(APIBase): # (ใช้สืบทอดใน Schema ที่ต้องการ config พิเศษ)
    code: str
    name: str
    contact: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None

class CustomerCreate(BaseModel): # (ใช้เวลาไม่ต้องการ config พิเศษ)
    # เดิมน่าจะเป็น: code: str   # (required)
    # แก้เป็น optional:
    code: Optional[str] = None
    name: str
    contact: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None

class CustomerUpdate(BaseModel):
    code: Optional[str] = None 
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

class POBase(APIBase):
    po_number: str 
    customer_id: int 
    description: Optional[str] = None

class POCreate(BaseModel):
    po_number:  Optional[str] = None
    customer_id: int
    description: Optional[str] = None

class POUpdate(BaseModel):
    po_number: Optional[str] = None
    customer_id: Optional[int] = None
    description: Optional[str] = None

class POOut(POBase):
    id: int

# =========================================
# ================ Employees ==============
# =========================================
from pydantic import BaseModel, ConfigDict
from typing import Optional, List

# ==========================================
# MINI MODEL (หัวหน้า / ลูกทีม)
# ==========================================
class EmployeeMiniOut(BaseModel):
    id: int
    emp_code: str
    name: str

    model_config = ConfigDict(from_attributes=True)  # ✅ ใช้ v2 style


# ==========================================
# BASE
# ==========================================
class EmployeeBase(BaseModel):  # ← เดิมคุณ inherit จาก APIBase (ไม่แน่ใจว่าจำเป็นไหม)
    emp_code: str
    name: str
    position: Optional[str] = None
    department: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    status: Optional[str] = "active"
    payroll_emp_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# CREATE / UPDATE
# ==========================================
class EmployeeCreate(BaseModel):
    emp_code: Optional[str] = None
    name: str
    position: Optional[str] = None
    department: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    status: Optional[str] = "active"
    payroll_emp_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class EmployeeUpdate(BaseModel):
    emp_code: Optional[str] = None
    name: Optional[str] = None
    position: Optional[str] = None
    department: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    status: Optional[str] = None
    payroll_emp_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# OUTPUT (มี nested relationships)
# ==========================================
class EmployeeOut(EmployeeBase):
    id: int
    payroll_emp_id: Optional[int] = None
    payroll_emp: Optional[EmployeeMiniOut] = None
    payroll_dependents: List[EmployeeMiniOut] = []

    model_config = ConfigDict(from_attributes=True)

# =========================================
# ================= Suppliers =============
# =========================================
class SupplierBase(APIBase):
    code: str
    name: str
    contact: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    payment_terms: Optional[str] = None

class SupplierCreate(BaseModel):
    code: Optional[str] = None
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

class SupplierOut(SupplierBase):
    id: int
    

# =========================================
# ============== Raw Materials ============
# =========================================
class RawMaterialBase(APIBase):
    code: str
    name: str
    spec: Optional[str] = None
    uom: Optional[str] = None
    remark: Optional[str] = None
class RawMaterialCreate(BaseModel):
    code: Optional[str] = None
    name: str
    spec: Optional[str] = None
    uom: Optional[str] = "kg"
    remark: Optional[str] = None

class RawMaterialUpdate(BaseModel):
    name: Optional[str] = None
    spec: Optional[str] = None
    uom: Optional[str] = None
    remark: Optional[str] = None

class RawMaterialOut(RawMaterialBase):
    id: int
  

# =========================================
# ================= Raw Batches ===========
# =========================================
class RawBatchBase(APIBase):
    material_id: int
    batch_no: Optional[str] = None
    supplier_id: Optional[int] = None
    supplier_batch_no: Optional[str] = None
    mill_name: Optional[str] = None
    mill_heat_no: Optional[str] = None
    received_at: Optional[date] = None

    # เปลี่ยนสองบรรทัดนี้
    qty_received: Decimal = Field(default=Decimal("0"))
    qty_used:     Decimal = Field(default=Decimal("0"))

    location: Optional[str] = None
    cert_file: Optional[str] = None


# schemas.py (Pydantic v2)
from pydantic import BaseModel, Field, field_validator, ConfigDict
from datetime import date, datetime
from decimal import Decimal

class RawBatchCreate(BaseModel):
    material_id: int
    # Allow empty/'AUTO'/'AUTOGEN' -> router will autogenerate
    batch_no: str | None = Field(default=None, description="Empty/AUTO/AUTOGEN to autogenerate")
    supplier_id: int | None = None
    supplier_batch_no: str | None = None
    mill_name: str | None = None
    mill_heat_no: str | None = None
    # Accept date or ISO datetime, store as date
    received_at: date | None = None
    # Accept "0", "", numbers; enforce >= 0 (no negatives)
    qty_received: Decimal = Field(default=Decimal("0"), ge=Decimal("0"))
    location: str | None = None
    cert_file: str | None = None

    # Ignore stray fields instead of 422
    model_config = ConfigDict(extra="ignore")

    @field_validator("batch_no", mode="before")
    @classmethod
    def _norm_batch_no(cls, v):
        if v is None:
            return None
        s = str(v).strip()
        return None if s == "" or s.upper() in {"AUTO", "AUTOGEN"} else s

    @field_validator("qty_received", mode="before")
    @classmethod
    def _coerce_qty(cls, v):
        if v is None or v == "":
            return Decimal("0")
        # Accept int/float/str with commas
        s = str(v).replace(",", "").strip()
        d = Decimal(s)
        if d < 0:
            raise ValueError("qty_received must be >= 0")
        return d

    @field_validator("received_at", mode="before")
    @classmethod
    def _coerce_date(cls, v):
        if v in (None, ""):
            return None
        if isinstance(v, date) and not isinstance(v, datetime):
            return v
        if isinstance(v, datetime):
            return v.date()
        s = str(v).strip()
        # Accept 'YYYY-MM-DD'
        try:
            return date.fromisoformat(s[:10])
        except Exception:
            pass
        # Accept full ISO datetime (e.g. '2025-09-11T13:45')
        try:
            return datetime.fromisoformat(s).date()
        except Exception:
            raise ValueError("received_at must be YYYY-MM-DD or ISO datetime")


from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import date
from decimal import Decimal

class RawBatchUpdate(BaseModel):
    material_id: Optional[int] = None
    batch_no: Optional[str] = None
    supplier_id: Optional[int] = None
    supplier_batch_no: Optional[str] = None
    mill_name: Optional[str] = None
    mill_heat_no: Optional[str] = None
    received_at: Optional[date] = None
    qty_received: Optional[Decimal] = Field(None, ge=Decimal("0"))
    # qty_used: Optional[Decimal] = Field(None, ge=Decimal("0"))     # ← NEW
    location: Optional[str] = None
    cert_file: Optional[str] = None

    received_qty: Optional[Decimal] = None
    unit_cost: Optional[Decimal] = None

    @field_validator('received_qty', 'unit_cost', mode='before', check_fields=False)
    @classmethod
    def _coerce_decimal(cls, v):
        if v in (None, ''):
            return None
        return Decimal(str(v))

class RawBatchOut(RawBatchBase):
    id: int
    

# =========================
# ============== Production Lots ==========
# =========================
LotStatus = Literal["planned", "in_process", "hold", "completed", "shipped", "canceled","not_start"]


class ProductionLotCreate(BaseModel):
  
    lot_no: str
    part_id: int
    part_revision_id: Optional[int] = None
    po_id: Optional[int] = None
    planned_qty: int = 0
    lot_due_date : Optional[datetime] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    status: Optional[LotStatus] = "in_process"

class ProductionLotUpdate(BaseModel):
    lot_no: Optional[str] = None         
    part_id: Optional[int] = None
    part_revision_id: Optional[int] = None
    po_id: Optional[int] = None
    lot_due_date : Optional[datetime] = None
    planned_ship_qty: Optional[int] = None   # ✅ ADD THIS
    planned_qty: Optional[int] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    status: Optional[str] = None
    note: Optional[str] = None

class PartTiny(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    part_no: str
    name: Optional[str] = None

class POTiny(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    po_number: Optional[str] = None
    description: Optional[str] = None

class PartRevisionTiny(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    rev: str
    is_current: Optional[bool] = None

class ProductionLotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    lot_no: str
    part_id: int
    part_revision_id: Optional[int] = None
    po_id: Optional[int] = None

    planned_qty: int
    lot_due_date : Optional[datetime] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    status: Optional[str] = None
    

    # ✅ nested objects
    part: Optional[PartTiny] = None
    po: Optional[POTiny] = None
    revision: Optional[PartRevisionTiny] = None  # <- NEW
    # traveler_ids: List[int] = []
    traveler_ids: List[int] = Field(default_factory=list)  # ← แทน []
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

# schemas.py
from pydantic import BaseModel, ConfigDict
from datetime import date
from typing import Optional

class ShopTravelerCreate(BaseModel):
    traveler_no: Optional[str] = None
    lot_id: int
    created_by_id: Optional[int] = None
    status: str = "open"
    notes: Optional[str] = None
    production_due_date: Optional[date] = None

class ShopTravelerUpdate(BaseModel):
    traveler_no: Optional[str] = None
    lot_id: Optional[int] = None            # ✅ อนุญาตแก้ lot ได้ (ถ้าไม่ต้องการ ให้ลบออก)
    created_by_id: Optional[int] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    production_due_date: Optional[date] = None

class ShopTravelerRowOut(BaseModel):
    traveler_no: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)
    id: int
    lot_id: int
    lot_no: Optional[str] = None
    created_by_id: Optional[int] = None
    status: str
    notes: Optional[str] = None
    production_due_date: Optional[date] = None
    created_at: Optional[str] = None  # or datetime, ตามที่คุณใช้เดิม

# --- เพิ่มส่วนนี้ด้านบนที่ประกาศ schemas ---
from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime

class LotMini(BaseModel):
    model_config = ConfigDict(from_attributes=True)  # pydantic v2
    id: int
    lot_no: Optional[str] = None
    due_date: Optional[datetime] = None
    production_due_date: datetime | None = None   # ⬅️ เพิ่มฟิลด์นี้

class ShopTravelerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    lot_id: int
    lot_no: Optional[str] = None
    created_by_id: Optional[int] = None
    status: str
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    production_due_date: Optional[date] = None

    

StepStatus = Literal["pending", "running", "passed", "failed", "skipped"]

# ---------------- Base ----------------
class ShopTravelerStepBase(BaseModel):
    seq: int
    step_name: str
    step_code: Optional[str] = None
    station: Optional[str] = None
    operator_id: Optional[int] = None
    qa_required: Optional[bool] = False
    # ปริมาณ
    qty_receive: Optional[Decimal] = None
    qty_accept:  Optional[Decimal] = None
    qty_reject:  Optional[Decimal] = None

# ---------------- Create ----------------
class ShopTravelerStepCreate(BaseModel):
    traveler_id: int
    seq: int
    step_code: Optional[str] = None
    step_name: str
    station: Optional[str] = None
    operator_id: Optional[int] = None
    qa_required: Optional[bool] = None
    qty_receive: Optional[Decimal] = None
    qty_accept: Optional[Decimal] = None
    qty_reject: Optional[Decimal] = None
    status: Optional[str] = None
    step_note: Optional[str] = None        # 👈 ใหม่
    step_detail: Optional[str] = ""


# ---------------- Update ----------------
class ShopTravelerStepUpdate(BaseModel):
    seq: Optional[int] = None
    step_code: Optional[str] = None
    step_name: Optional[str] = None
    step_detail: Optional[str]   # 👈 ต้องมี
    station: Optional[str] = None
    operator_id: Optional[int] = None
    qa_required: Optional[bool] = None
    qty_receive: Optional[Decimal] = None
    qty_accept: Optional[Decimal] = None
    qty_reject: Optional[Decimal] = None
    status: Optional[str] = None
    step_note: Optional[str] = None        # 👈 ใหม่

class ShopTravelerStepOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    traveler_id: int
    seq: int
    step_code: Optional[str] = None
    step_name: str
    step_detail: Optional[str] = ""   # ✅ FIX
    station: Optional[str] = None
    operator_id: Optional[int] = None
    qa_required: bool
    status: str
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    qty_receive: Decimal
    qty_accept: Decimal
    qty_reject: Decimal
    step_note: Optional[str] = None        # 👈 ใหม่
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
    lines: List[SubconOrderLineOut] = Field(default_factory=list)

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
    items: List[SubconShipmentItemOut] = Field(default_factory=list)

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
    items: List[SubconReceiptItemOut] = Field(default_factory=list)

# =========================================
# ============== Break Entries ============
# =========================================
class BreakEntryBase(APIBase):
    break_type: str = "lunch"
    method: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None
    is_paid: bool = False

class BreakEntryCreate(BreakEntryBase):
    time_entry_id: int
    start_at: Optional[datetime] = None

class BreakEntryOut(BreakEntryBase):
    id: int
    time_entry_id: int
    start_at: datetime
    end_at: Optional[datetime] = None

# =========================================
# ================== Leave =================
# =========================================
# Decimal constraints (ตัวอย่างการบังคับ digit/decimal places)
Decimal5_2 = Annotated[Decimal, Field(max_digits=5, decimal_places=2)]
Decimal4_2 = Annotated[Decimal, Field(max_digits=4, decimal_places=2)]
Decimal3_2 = Annotated[Decimal, Field(max_digits=3, decimal_places=2)]
Decimal8_2 = Annotated[Decimal, Field(max_digits=8, decimal_places=2)]

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

class LeaveEntryBase(APIBase):
    leave_type: LeaveType = LeaveType.vacation
    notes: Optional[str] = None
    is_paid: bool = True
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

class LeaveEntryUpdate(APIBase):
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

# =========================================
# ================= Holiday ===============
# =========================================
class HolidayBase(APIBase):
    name: str
    is_paid: bool = True
    hours: Optional[Annotated[Decimal4_2, Field(ge=0, le=24)]] = None
    pay_multiplier: Optional[Annotated[Decimal3_2, Field(ge=1)]] = None
    notes: Optional[str] = None

class HolidayCreate(HolidayBase):
    holiday_date: date

class HolidayUpdate(APIBase):
    name: Optional[str] = None
    is_paid: Optional[bool] = None
    hours: Optional[Annotated[Decimal4_2, Field(ge=0, le=24)]] = None
    pay_multiplier: Optional[Annotated[Decimal3_2, Field(ge=1)]] = None
    notes: Optional[str] = None
    holiday_date: Optional[date] = None

class HolidayOut(HolidayBase):
    id: int
    holiday_date: date

# =========================================
# ================== Users =================
# =========================================
from pydantic import EmailStr  # แยก import เพื่อความชัดเจน

class UserBase(APIBase):
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

class SetPasswordIn(APIBase):
    new_password: str

class AssignRoleIn(APIBase):
    role_code: str

class RoleOut(APIBase):
    id: int
    code: str
    name: str

class PermissionOut(APIBase):
    id: int
    code: str
    name: str



# ===== Decimal helpers (ADD) =====
# from pydantic import condecimal

# Decimal8_2 = condecimal(max_digits=8, decimal_places=2)
# Decimal4_2 = condecimal(max_digits=4, decimal_places=2)

# =========================================
# ================= Pay Rates =============
# =========================================
class PayRateBase(APIBase):
    hourly_rate: Decimal8_2
    ot_multiplier: Optional[Decimal4_2] = Decimal("1.50")
    dt_multiplier: Optional[Decimal4_2] = Decimal("2.00")

class PayRateCreate(PayRateBase):
    employee_id: int
    effective_from: datetime

class PayRateUpdate(APIBase):
    # อนุญาตแก้ไขเรตล่าสุด (หรือทำเป็น append-only ใน service ก็ได้)
    hourly_rate: Optional[Decimal8_2] = None
    ot_multiplier: Optional[Decimal4_2] = None
    dt_multiplier: Optional[Decimal4_2] = None
    effective_from: Optional[datetime] = None

class PayRateOut(PayRateBase):
    id: int
    employee_id: int
    effective_from: datetime

    # =========================================
# =============== Time Entries ============
# =========================================
TimeEntryStatus = Literal["open", "closed", "cancelled"]

class TimeEntryBase(APIBase):
    employee_id: int
    created_by_user_id: Optional[int] = None
    work_user_id: Optional[int] = None
    clock_in_at: Optional[datetime] = None
    clock_in_method: Optional[str] = None
    clock_in_location: Optional[str] = None
    clock_out_at: Optional[datetime] = None
    clock_out_method: Optional[str] = None
    clock_out_location: Optional[str] = None
    status: TimeEntryStatus = "open"
    notes: Optional[str] = None

class TimeEntryCreate(TimeEntryBase):
    @model_validator(mode="after")
    def _validate_range(self):
        if self.clock_out_at and self.clock_in_at and self.clock_out_at < self.clock_in_at:
            raise ValueError("clock_out_at must be >= clock_in_at")
        return self

class TimeEntryUpdate(APIBase):
    created_by_user_id: Optional[int] = None
    work_user_id: Optional[int] = None
    clock_in_at: Optional[datetime] = None
    clock_in_method: Optional[str] = None
    clock_in_location: Optional[str] = None
    clock_out_at: Optional[datetime] = None
    clock_out_method: Optional[str] = None
    clock_out_location: Optional[str] = None
    status: Optional[TimeEntryStatus] = None
    notes: Optional[str] = None

    @model_validator(mode="after")
    def _validate_range(self):
        if self.clock_out_at and self.clock_in_at and self.clock_out_at < self.clock_in_at:
            raise ValueError("clock_out_at must be >= clock_in_at")
        return self

class TimeEntryOut(TimeEntryBase):
    id: int



class PayPeriodBase(BaseModel):
    name: Optional[str] = None
    start_at: datetime
    end_at: datetime
    status: Literal["open", "locked", "paid"] = "open"
    anchor: Optional[str] = None
    notes: Optional[str] = None

class PayPeriodCreate(PayPeriodBase):
    pass

class PayPeriodUpdate(BaseModel):
    name: Optional[str] = None
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    status: Optional[Literal["open", "locked", "paid"]] = None
    anchor: Optional[str] = None
    notes: Optional[str] = None

class PayPeriodOut(PayPeriodBase):
    id: int
    locked_at: Optional[datetime] = None
    paid_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)



class DetailRow(BaseModel):
    # ... other fields ...
    po_due_date: date | None = None
    lot_due_date: date | None = None

    @field_validator("po_due_date", "lot_due_date", mode="before")
    @classmethod
    def _ensure_date(cls, v):
        if v is None:
            return None
        if isinstance(v, date) and not isinstance(v, datetime):
            return v
        if isinstance(v, datetime):
            return v.date()
        # strings -> try ISO
        return datetime.fromisoformat(str(v)).date()
    
# schemas/time_leave.py
from pydantic import BaseModel
from datetime import datetime
from decimal import Decimal
from typing import Optional

class TimeLeaveBase(BaseModel):
    employee_id: int
    leave_type: str
    start_at: datetime
    end_at: datetime
    hours: Optional[Decimal] = None
    is_paid: bool = True
    status: str = "approved"
    notes: Optional[str] = None


class TimeLeaveCreate(TimeLeaveBase):
    pass


class TimeLeaveUpdate(BaseModel):
    leave_type: Optional[str]
    start_at: Optional[datetime]
    end_at: Optional[datetime]
    hours: Optional[Decimal]
    is_paid: Optional[bool]
    status: Optional[str]
    notes: Optional[str]


class TimeLeaveOut(TimeLeaveBase):
    id: int

    class Config:
        from_attributes = True


from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime

# =========================
# QAInspection (Header)
# =========================

class QAInspectionCreate(BaseModel):
    lot_id: int
    inspector_id: Optional[int] = None
    remarks: Optional[str] = None


class QAInspectionOut(BaseModel):
    id: int
    lot_id: int
    inspection_date: date
    inspector_id: Optional[int]
    status: str
    remarks: Optional[str]

    class Config:
        from_attributes = True


# =========================
# QAInspectionItem (Rows)
# =========================

class QAInspectionItemCreate(BaseModel):
    seq: int
    op_no: Optional[str] = None
    bb_no: Optional[str] = None
    dimension: Optional[str] = None
    tqw: Optional[str] = None
    fa: Optional[bool] = None
    actual_value: Optional[str] = None
    result: Optional[str] = None
    notes: Optional[str] = None
    emp_id: Optional[int] = None


class QAInspectionItemUpdate(BaseModel):
    seq: Optional[int] = None
    op_no: Optional[str] = None
    bb_no: Optional[str] = None
    dimension: Optional[str] = None
    tqw: Optional[str] = None
    fa: Optional[bool] = None
    actual_value: Optional[str] = None
    result: Optional[str] = None
    notes: Optional[str] = None
    emp_id: Optional[int] = None


class QAInspectionItemOut(BaseModel):
    id: int
    inspection_id: int
    seq: int
    op_no: Optional[str]
    bb_no: Optional[str]
    dimension: Optional[str]
    tqw: Optional[str]
    fa: Optional[bool]
    actual_value: Optional[str]
    result: Optional[str]
    notes: Optional[str]
    emp_id: Optional[int]
    qa_time_stamp: datetime

    class Config:
        from_attributes = True

# # ============================================================
# # 🧭 CustomerShipment
# # ============================================================

# class CustomerShipmentBase(BaseModel):
#     po_id: Optional[int] = None
#     ship_to: Optional[str] = None
#     carrier: Optional[str] = None
#     tracking_no: Optional[str] = None
#     package_no: Optional[str] = None
#     shipped_at: Optional[datetime] = None
#     note: Optional[str] = None


# class CustomerShipmentCreate(CustomerShipmentBase):
#     pass


# class CustomerShipmentUpdate(CustomerShipmentBase):
#     pass


# class CustomerShipmentOut(CustomerShipmentBase):
#     id: int
#     created_at: Optional[datetime] = None
#     updated_at: Optional[datetime] = None

#     po_number: Optional[str] = None
#     customer_name: Optional[str] = None

#     # 👇 This replaces orm_mode=True for Pydantic v2
#     model_config = ConfigDict(from_attributes=True)


# # ============================================================
# # 📦 CustomerShipmentItem
# # ============================================================

# class CustomerShipmentItemBase(BaseModel):
#     shipment_id: Optional[int] = None
#     po_line_id: Optional[int] = None
#     lot_id: Optional[int] = None
#     qty: Optional[float] = 0
#     note: Optional[str] = None


# class CustomerShipmentItemCreate(CustomerShipmentItemBase):
#     shipment_id: Optional[int] = None


# class CustomerShipmentItemUpdate(CustomerShipmentItemBase):
#     pass


# class CustomerShipmentItemOut(CustomerShipmentItemBase):
#     id: int
#     created_at: Optional[datetime] = None
#     updated_at: Optional[datetime] = None

#     po_number: Optional[str] = None
#     part_number: Optional[str] = None
#     lot_code: Optional[str] = None

#     model_config = ConfigDict(from_attributes=True)


