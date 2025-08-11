from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime

# ---------------- Customers ----------------
class CustomerBase(BaseModel):
    code: str
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
        from_attributes  = True

# ---------------- Purchase Orders ----------------
class POCreate(BaseModel):
    po_number: str
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
        from_attributes  = True


# ---------------- Employees ----------------
class EmployeeBase(BaseModel):
    emp_code: str
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


# ---------- Raw Batches ----------
class RawBatchCreate(BaseModel):
    material_id: int
    batch_no: str
    supplier: Optional[str] = None
    received_at: Optional[date] = None
    qty_received: float
    location: Optional[str] = None
    cert_file: Optional[str] = None

class RawBatchUpdate(BaseModel):
    batch_no: Optional[str] = None
    supplier: Optional[str] = None
    received_at: Optional[date] = None
    qty_received: Optional[float] = None
    location: Optional[str] = None
    cert_file: Optional[str] = None

class RawBatchOut(BaseModel):
    id: int
    material_id: int
    batch_no: str
    supplier: Optional[str] = None
    received_at: Optional[date] = None
    qty_received: float
    qty_used: float
    location: Optional[str] = None
    cert_file: Optional[str] = None
    class Config:
        from_attributes = True


# ---------- Production Lots ----------
class ProductionLotCreate(BaseModel):
    lot_no: str
    part_no: Optional[str] = None
    po_id: Optional[int] = None
    planned_qty: int = 0
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    status: Optional[str] = "in_process"

class ProductionLotUpdate(BaseModel):
    part_no: Optional[str] = None
    po_id: Optional[int] = None
    planned_qty: Optional[int] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    status: Optional[str] = None

class ProductionLotOut(BaseModel):
    id: int
    lot_no: str
    part_no: Optional[str] = None
    po_id: Optional[int] = None
    planned_qty: int
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    status: str
    class Config:
        from_attributes = True


# ---------- Lot Material Use ----------
class LotMaterialUseCreate(BaseModel):
    lot_id: int
    batch_id: int
    qty: float

class LotMaterialUseUpdate(BaseModel):
    qty: float  # เปลี่ยนปริมาณ (จะคำนวณ delta ให้)

class LotMaterialUseOut(BaseModel):
    id: int
    lot_id: int
    batch_id: int
    qty: float
    class Config:
        from_attributes = True

# -shoqp traveler
class ShopTravelerCreate(BaseModel):
    lot_id: int
    created_by_id: Optional[int] = None
    notes: Optional[str] = None
    status: Optional[str] = "open"  # open / in_progress / completed / hold / canceled

class ShopTravelerUpdate(BaseModel):
    created_by_id: Optional[int] = None
    notes: Optional[str] = None
    status: Optional[str] = None

class ShopTravelerOut(BaseModel):
    id: int
    lot_id: int
    created_by_id: Optional[int] = None
    status: str
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True   # (แทน orm_mode ใน Pydantic v2)


# --- Shop Traveler Steps ---
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
    status: Optional[str] = None           # pending / running / passed / failed / skipped
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    qa_result: Optional[str] = None        # pass / fail / n.a.
    qa_notes: Optional[str] = None

class ShopTravelerStepOut(BaseModel):
    id: int
    traveler_id: int
    seq: int
    step_name: str
    step_code: Optional[str] = None
    station: Optional[str] = None
    operator_id: Optional[int] = None
    status: str
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    qa_required: bool
    qa_result: Optional[str] = None
    qa_notes: Optional[str] = None

    class Config:
        from_attributes = True