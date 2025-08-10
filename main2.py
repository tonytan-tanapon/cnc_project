from fastapi import FastAPI, Depends, Form, Query, HTTPException,APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi import Request
from fastapi.templating import Jinja2Templates
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime
from fastapi.responses import StreamingResponse
from generate_qr import generate_qr_with_product_url  # ✅ import มาจากไฟล์ generate_qr.py

from database import SessionLocal, engine
from models import Base, PO

from models import Customer, Employee
from schemas import CustomerCreate, CustomerUpdate, CustomerOut
from schemas import POCreate, POUpdate, POOut
from schemas import EmployeeCreate, EmployeeUpdate, EmployeeOut

from models import RawMaterial, RawBatch, ProductionLot, PO, LotMaterialUse   # <-- สร้าง models ตามที่คุยไว้
from schemas import (
    RawMaterialCreate, RawMaterialUpdate, RawMaterialOut,
    RawBatchCreate, RawBatchUpdate, RawBatchOut,
    ProductionLotCreate, ProductionLotUpdate, ProductionLotOut,
    LotMaterialUseCreate, LotMaterialUseUpdate, LotMaterialUseOut
)

from models import ProductionLot, ShopTraveler, ShopTravelerStep, Employee
from schemas import (
    ShopTravelerCreate, ShopTravelerUpdate, ShopTravelerOut,
    ShopTravelerStepCreate, ShopTravelerStepUpdate, ShopTravelerStepOut
)
from typing import List
# import models
# import crud

# ✅ สร้างตารางใน database ตาม models
Base.metadata.create_all(bind=engine)

# ✅ สร้าง FastAPI app
app = FastAPI()

# ✅ ตั้งค่า CORS สำหรับมือถือหรือ frontend อื่นเรียกใช้
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # หรือกำหนดเป็น ["http://<ip>:8080"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# ✅ Dependency สำหรับเชื่อมต่อ DB
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ✅ โมเดลรับข้อมูล QR
class QRData(BaseModel):
    data: str

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


# ---------------- Customers ----------------
cust_router = APIRouter(prefix="/customers", tags=["customers"])

@cust_router.post("", response_model=CustomerOut)
def create_customer(customer: CustomerCreate, db: Session = Depends(get_db)):
    code = customer.code.upper().strip()
    if db.query(Customer).filter(Customer.code == code).first():
        raise HTTPException(status_code=400, detail="Customer code already exists")
    new_cust = Customer(**{**customer.dict(), "code": code})
    db.add(new_cust); db.commit(); db.refresh(new_cust)
    return new_cust

@cust_router.get("", response_model=List[CustomerOut])
def get_customers(db: Session = Depends(get_db)):
    return db.query(Customer).all()

@cust_router.get("/{customer_id}", response_model=CustomerOut)
def get_customer(customer_id: int, db: Session = Depends(get_db)):
    cust = db.query(Customer).filter(Customer.id == customer_id).first()
    if not cust:
        raise HTTPException(status_code=404, detail="Customer not found")
    return cust

@cust_router.put("/{customer_id}", response_model=CustomerOut)
def update_customer(customer_id: int, update_data: CustomerUpdate, db: Session = Depends(get_db)):
    cust = db.query(Customer).filter(Customer.id == customer_id).first()
    if not cust:
        raise HTTPException(status_code=404, detail="Customer not found")
    for k, v in update_data.dict(exclude_unset=True).items():
        setattr(cust, k, v)
    db.commit(); db.refresh(cust)
    return cust

@cust_router.delete("/{customer_id}")
def delete_customer(customer_id: int, db: Session = Depends(get_db)):
    cust = db.query(Customer).filter(Customer.id == customer_id).first()
    if not cust:
        raise HTTPException(status_code=404, detail="Customer not found")
    db.delete(cust); db.commit()
    return {"message": "Customer deleted successfully"}

# --- include ทั้งสอง router ---
app.include_router(cust_router)     # อย่าใส่ prefix ซ้ำที่ include



# ---------------- Purchase Orders ----------------

from models import PO, Customer

pos_router = APIRouter(prefix="/pos", tags=["pos"])

# 1) Create
@pos_router.post("", response_model=POOut)
def create_po(payload: POCreate, db: Session = Depends(get_db)):
    # po_number ต้องไม่ซ้ำ
    exists = db.query(PO).filter(PO.po_number == payload.po_number).first()
    if exists:
        raise HTTPException(status_code=409, detail="PO number already exists")

    # ต้องมี customer_id นี้อยู่จริง
    cust = db.get(Customer, payload.customer_id)
    if not cust:
        raise HTTPException(status_code=400, detail="customer_id not found")

    po = PO(po_number=payload.po_number.strip(),
            description=payload.description,
            customer_id=payload.customer_id)
    db.add(po)
    db.commit()
    db.refresh(po)
    return po

# 2) Read all
@pos_router.get("", response_model=List[POOut])
def list_pos(db: Session = Depends(get_db)):
    return db.query(PO).order_by(PO.id.desc()).all()

# 3) Read by id
@pos_router.get("/{po_id}", response_model=POOut)
def get_po(po_id: int, db: Session = Depends(get_db)):
    po = db.get(PO, po_id)
    if not po:
        raise HTTPException(status_code=404, detail="PO not found")
    return po

# 4) Update
@pos_router.put("/{po_id}", response_model=POOut)
def update_po(po_id: int, payload: POUpdate, db: Session = Depends(get_db)):
    po = db.get(PO, po_id)
    if not po:
        raise HTTPException(status_code=404, detail="PO not found")

    data = payload.dict(exclude_unset=True)

    # ถ้าอัปเดต po_number → ต้องไม่ซ้ำของคนอื่น
    if "po_number" in data and data["po_number"]:
        new_no = data["po_number"].strip()
        dup = db.query(PO).filter(PO.po_number == new_no, PO.id != po_id).first()
        if dup:
            raise HTTPException(status_code=409, detail="PO number already exists")
        po.po_number = new_no

    # ถ้าอัปเดต customer_id → ต้องมีจริง
    if "customer_id" in data and data["customer_id"] is not None:
        cust = db.get(Customer, data["customer_id"])
        if not cust:
            raise HTTPException(status_code=400, detail="customer_id not found")
        po.customer_id = data["customer_id"]

    if "description" in data:
        po.description = data["description"]

    db.commit()
    db.refresh(po)
    return po

# 5) Delete
@pos_router.delete("/{po_id}")
def delete_po(po_id: int, db: Session = Depends(get_db)):
    po = db.get(PO, po_id)
    if not po:
        raise HTTPException(status_code=404, detail="PO not found")
    db.delete(po)
    db.commit()
    return {"message": "PO deleted successfully"}

app.include_router(pos_router) 

# ---------------- Employees ----------------
emp_router = APIRouter(prefix="/employees", tags=["employees"])

@emp_router.post("", response_model=EmployeeOut)
def create_employee(emp: EmployeeCreate, db: Session = Depends(get_db)):
    if db.query(Employee).filter(Employee.emp_code == emp.emp_code).first():
        raise HTTPException(status_code=400, detail="Employee code already exists")
    new_emp = Employee(**emp.dict())
    db.add(new_emp)
    db.commit()
    db.refresh(new_emp)
    return new_emp

@emp_router.get("", response_model=List[EmployeeOut])
def get_employees(db: Session = Depends(get_db)):
    return db.query(Employee).all()

@emp_router.get("/{emp_id}", response_model=EmployeeOut)
def get_employee(emp_id: int, db: Session = Depends(get_db)):
    emp = db.query(Employee).filter(Employee.id == emp_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    return emp

@emp_router.put("/{emp_id}", response_model=EmployeeOut)
def update_employee(emp_id: int, updated: EmployeeUpdate, db: Session = Depends(get_db)):
    emp = db.query(Employee).filter(Employee.id == emp_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    for key, value in updated.dict(exclude_unset=True).items():
        setattr(emp, key, value)
    db.commit()
    db.refresh(emp)
    return emp

@emp_router.delete("/{emp_id}")
def delete_employee(emp_id: int, db: Session = Depends(get_db)):
    emp = db.query(Employee).filter(Employee.id == emp_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    db.delete(emp)
    db.commit()
    return {"message": "Employee deleted successfully"}

app.include_router(emp_router) 

# ---------------- Raw Materials ----------------
materials_router = APIRouter(prefix="/materials", tags=["materials"])

@materials_router.post("", response_model=RawMaterialOut)
def create_material(payload: RawMaterialCreate, db: Session = Depends(get_db)):
    code = payload.code.strip().upper()
    if db.query(RawMaterial).filter(RawMaterial.code == code).first():
        raise HTTPException(status_code=409, detail="Material code already exists")
    m = RawMaterial(code=code, name=payload.name.strip(), spec=payload.spec, uom=payload.uom, remark=payload.remark)
    db.add(m); db.commit(); db.refresh(m)
    return m

@materials_router.get("", response_model=List[RawMaterialOut])
def list_materials(db: Session = Depends(get_db)):
    return db.query(RawMaterial).order_by(RawMaterial.id.desc()).all()

@materials_router.get("/{mat_id}", response_model=RawMaterialOut)
def get_material(mat_id: int, db: Session = Depends(get_db)):
    m = db.get(RawMaterial, mat_id)
    if not m: raise HTTPException(status_code=404, detail="Material not found")
    return m

@materials_router.put("/{mat_id}", response_model=RawMaterialOut)
def update_material(mat_id: int, payload: RawMaterialUpdate, db: Session = Depends(get_db)):
    m = db.get(RawMaterial, mat_id)
    if not m: raise HTTPException(status_code=404, detail="Material not found")
    for k, v in payload.dict(exclude_unset=True).items():
        setattr(m, k, v)
    db.commit(); db.refresh(m)
    return m

@materials_router.delete("/{mat_id}")
def delete_material(mat_id: int, db: Session = Depends(get_db)):
    m = db.get(RawMaterial, mat_id)
    if not m: raise HTTPException(status_code=404, detail="Material not found")
    # ป้องกันการลบถ้ามี batch ผูกอยู่ (เลือกได้ว่าจะบล็อกหรือ cascade)
    if m.batches:
        raise HTTPException(status_code=400, detail="Material has batches; cannot delete")
    db.delete(m); db.commit()
    return {"message": "Material deleted"}
app.include_router(materials_router)

# ---------------- Raw Batches ----------------
batches_router = APIRouter(prefix="/batches", tags=["batches"])

@batches_router.post("", response_model=RawBatchOut)
def create_batch(payload: RawBatchCreate, db: Session = Depends(get_db)):
    if not db.get(RawMaterial, payload.material_id):
        raise HTTPException(status_code=404, detail="Material not found")
    b = RawBatch(
        material_id=payload.material_id,
        batch_no=payload.batch_no.strip(),
        supplier=payload.supplier,
        received_at=payload.received_at,
        qty_received=payload.qty_received,
        qty_used=0.0,
        location=payload.location,
        cert_file=payload.cert_file,
    )
    db.add(b); db.commit(); db.refresh(b)
    return b

@batches_router.get("", response_model=List[RawBatchOut])
def list_batches(db: Session = Depends(get_db)):
    return db.query(RawBatch).order_by(RawBatch.id.desc()).all()

@batches_router.get("/{batch_id}", response_model=RawBatchOut)
def get_batch(batch_id: int, db: Session = Depends(get_db)):
    b = db.get(RawBatch, batch_id)
    if not b: raise HTTPException(status_code=404, detail="Batch not found")
    return b

@batches_router.put("/{batch_id}", response_model=RawBatchOut)
def update_batch(batch_id: int, payload: RawBatchUpdate, db: Session = Depends(get_db)):
    b = db.get(RawBatch, batch_id)
    if not b: raise HTTPException(status_code=404, detail="Batch not found")
    data = payload.dict(exclude_unset=True)
    # ห้ามตั้ง qty_received ให้ < qty_used
    if "qty_received" in data and data["qty_received"] is not None:
        if data["qty_received"] < b.qty_used:
            raise HTTPException(status_code=400, detail="qty_received cannot be less than qty_used")
        b.qty_received = data["qty_received"]
        del data["qty_received"]
    for k, v in data.items():
        setattr(b, k, v)
    db.commit(); db.refresh(b)
    return b

@batches_router.delete("/{batch_id}")
def delete_batch(batch_id: int, db: Session = Depends(get_db)):
    b = db.get(RawBatch, batch_id)
    if not b: raise HTTPException(status_code=404, detail="Batch not found")
    # บล็อกการลบถ้ามีการใช้งานแล้ว
    if b.qty_used > 0 or (b.uses and len(b.uses) > 0):
        raise HTTPException(status_code=400, detail="Batch already used; cannot delete")
    db.delete(b); db.commit()
    return {"message": "Batch deleted"}
app.include_router(batches_router)
# ---------------- Production Lots ----------------
lots_router = APIRouter(prefix="/lots", tags=["lots"])

@lots_router.post("", response_model=ProductionLotOut)
def create_lot(payload: ProductionLotCreate, db: Session = Depends(get_db)):
    if payload.po_id is not None and not db.get(PO, payload.po_id):
        raise HTTPException(status_code=404, detail="PO not found")
    if db.query(ProductionLot).filter(ProductionLot.lot_no == payload.lot_no).first():
        raise HTTPException(status_code=409, detail="Lot number already exists")
    lot = ProductionLot(
        lot_no=payload.lot_no.strip(),
        part_no=payload.part_no,
        po_id=payload.po_id,
        planned_qty=payload.planned_qty,
        started_at=payload.started_at,
        finished_at=payload.finished_at,
        status=payload.status or "in_process",
    )
    db.add(lot); db.commit(); db.refresh(lot)
    return lot

@lots_router.get("", response_model=List[ProductionLotOut])
def list_lots(db: Session = Depends(get_db)):
    return db.query(ProductionLot).order_by(ProductionLot.id.desc()).all()

@lots_router.get("/{lot_id}", response_model=ProductionLotOut)
def get_lot(lot_id: int, db: Session = Depends(get_db)):
    lot = db.get(ProductionLot, lot_id)
    if not lot: raise HTTPException(status_code=404, detail="Lot not found")
    return lot

@lots_router.put("/{lot_id}", response_model=ProductionLotOut)
def update_lot(lot_id: int, payload: ProductionLotUpdate, db: Session = Depends(get_db)):
    lot = db.get(ProductionLot, lot_id)
    if not lot: raise HTTPException(status_code=404, detail="Lot not found")
    data = payload.dict(exclude_unset=True)
    if "po_id" in data and data["po_id"] is not None:
        if not db.get(PO, data["po_id"]):
            raise HTTPException(status_code=404, detail="PO not found")
    for k, v in data.items():
        setattr(lot, k, v)
    db.commit(); db.refresh(lot)
    return lot

@lots_router.delete("/{lot_id}")
def delete_lot(lot_id: int, db: Session = Depends(get_db)):
    lot = db.get(ProductionLot, lot_id)
    if not lot: raise HTTPException(status_code=404, detail="Lot not found")
    # กันลบถ้ามี material ใช้อยู่
    if lot.material_uses and len(lot.material_uses) > 0:
        raise HTTPException(status_code=400, detail="Lot has material usage; cannot delete")
    db.delete(lot); db.commit()
    return {"message": "Lot deleted"}
app.include_router(lots_router)

# ---------------- Lot Material Use ----------------
lotuse_router = APIRouter(prefix="/lot-uses", tags=["lot_uses"])

@lotuse_router.post("", response_model=LotMaterialUseOut)
def create_lot_use(payload: LotMaterialUseCreate, db: Session = Depends(get_db)):
    lot = db.get(ProductionLot, payload.lot_id)
    batch = db.get(RawBatch, payload.batch_id)
    if not lot: raise HTTPException(status_code=404, detail="Lot not found")
    if not batch: raise HTTPException(status_code=404, detail="Batch not found")
    if payload.qty <= 0:
        raise HTTPException(status_code=400, detail="qty must be > 0")
    if batch.qty_used + payload.qty > batch.qty_received:
        raise HTTPException(status_code=400, detail="Not enough batch balance")

    use = LotMaterialUse(lot_id=payload.lot_id, batch_id=payload.batch_id, qty=payload.qty)
    batch.qty_used += payload.qty
    db.add(use); db.commit(); db.refresh(use)
    return use

@lotuse_router.get("", response_model=List[LotMaterialUseOut])
def list_lot_uses(db: Session = Depends(get_db)):
    return db.query(LotMaterialUse).order_by(LotMaterialUse.id.desc()).all()

@lotuse_router.get("/{use_id}", response_model=LotMaterialUseOut)
def get_lot_use(use_id: int, db: Session = Depends(get_db)):
    u = db.get(LotMaterialUse, use_id)
    if not u: raise HTTPException(status_code=404, detail="Usage not found")
    return u

@lotuse_router.put("/{use_id}", response_model=LotMaterialUseOut)
def update_lot_use(use_id: int, payload: LotMaterialUseUpdate, db: Session = Depends(get_db)):
    u = db.get(LotMaterialUse, use_id)
    if not u: raise HTTPException(status_code=404, detail="Usage not found")
    if payload.qty <= 0:
        raise HTTPException(status_code=400, detail="qty must be > 0")

    batch = db.get(RawBatch, u.batch_id)
    delta = payload.qty - u.qty
    # ถ้าเพิ่ม ต้องมีของพอ
    if delta > 0 and (batch.qty_used + delta > batch.qty_received):
        raise HTTPException(status_code=400, detail="Not enough batch balance")

    # ปรับยอด
    u.qty = payload.qty
    batch.qty_used += delta
    db.commit(); db.refresh(u)
    return u

@lotuse_router.delete("/{use_id}")
def delete_lot_use(use_id: int, db: Session = Depends(get_db)):
    u = db.get(LotMaterialUse, use_id)
    if not u: raise HTTPException(status_code=404, detail="Usage not found")
    batch = db.get(RawBatch, u.batch_id)
    # คืนสต็อกกลับ
    batch.qty_used -= u.qty
    db.delete(u); db.commit()
    return {"message": "Usage deleted"}
app.include_router(lotuse_router)


#----Shop
travelers_router = APIRouter(prefix="/travelers", tags=["travelers"])
steps_router = APIRouter(prefix="/traveler-steps", tags=["traveler_steps"])

# ---------- ShopTraveler CRUD ----------
@travelers_router.post("", response_model=ShopTravelerOut)
def create_traveler(payload: ShopTravelerCreate, db: Session = Depends(get_db)):
    lot = db.get(ProductionLot, payload.lot_id)
    if not lot:
        raise HTTPException(status_code=404, detail="Lot not found")
    if lot.traveler:
        raise HTTPException(status_code=409, detail="Traveler already exists for this lot")

    # optional: validate employee
    if payload.created_by_id and not db.get(Employee, payload.created_by_id):
        raise HTTPException(status_code=404, detail="Creator employee not found")

    t = ShopTraveler(
        lot_id=payload.lot_id,
        created_by_id=payload.created_by_id,
        status=payload.status or "open",
        notes=payload.notes,
    )
    db.add(t); db.commit(); db.refresh(t)
    return t

@travelers_router.get("", response_model=List[ShopTravelerOut])
def list_travelers(db: Session = Depends(get_db)):
    return db.query(ShopTraveler).order_by(ShopTraveler.id.desc()).all()

@travelers_router.get("/{traveler_id}", response_model=ShopTravelerOut)
def get_traveler(traveler_id: int, db: Session = Depends(get_db)):
    t = db.get(ShopTraveler, traveler_id)
    if not t:
        raise HTTPException(status_code=404, detail="Traveler not found")
    return t

@travelers_router.put("/{traveler_id}", response_model=ShopTravelerOut)
def update_traveler(traveler_id: int, payload: ShopTravelerUpdate, db: Session = Depends(get_db)):
    t = db.get(ShopTraveler, traveler_id)
    if not t:
        raise HTTPException(status_code=404, detail="Traveler not found")

    data = payload.dict(exclude_unset=True)
    if "created_by_id" in data and data["created_by_id"] is not None:
        if not db.get(Employee, data["created_by_id"]):
            raise HTTPException(status_code=404, detail="Creator employee not found")

    for k, v in data.items():
        setattr(t, k, v)

    db.commit(); db.refresh(t)
    return t

@travelers_router.delete("/{traveler_id}")
def delete_traveler(traveler_id: int, db: Session = Depends(get_db)):
    t = db.get(ShopTraveler, traveler_id)
    if not t:
        raise HTTPException(status_code=404, detail="Traveler not found")
    if t.steps and len(t.steps) > 0:
        raise HTTPException(status_code=400, detail="Traveler has steps; cannot delete")
    db.delete(t); db.commit()
    return {"message": "Traveler deleted"}


# ---------- ShopTravelerStep CRUD + Actions ----------
@steps_router.post("", response_model=ShopTravelerStepOut)
def create_traveler_step(payload: ShopTravelerStepCreate, db: Session = Depends(get_db)):
    t = db.get(ShopTraveler, payload.traveler_id)
    if not t:
        raise HTTPException(status_code=404, detail="Traveler not found")
    if payload.operator_id and not db.get(Employee, payload.operator_id):
        raise HTTPException(status_code=404, detail="Operator not found")

    # enforce unique (traveler_id, seq)
    dup = db.query(ShopTravelerStep).filter(
        ShopTravelerStep.traveler_id == payload.traveler_id,
        ShopTravelerStep.seq == payload.seq
    ).first()
    if dup:
        raise HTTPException(status_code=409, detail="This seq already exists in traveler")

    s = ShopTravelerStep(
        traveler_id=payload.traveler_id,
        seq=payload.seq,
        step_name=payload.step_name,
        step_code=payload.step_code,
        station=payload.station,
        operator_id=payload.operator_id,
        qa_required=payload.qa_required or False,
        status="pending"
    )
    db.add(s); db.commit(); db.refresh(s)
    return s

@steps_router.get("", response_model=List[ShopTravelerStepOut])
def list_traveler_steps(traveler_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(ShopTravelerStep)
    if traveler_id:
        q = q.filter(ShopTravelerStep.traveler_id == traveler_id).order_by(ShopTravelerStep.seq.asc())
    else:
        q = q.order_by(ShopTravelerStep.id.desc())
    return q.all()

@steps_router.get("/{step_id}", response_model=ShopTravelerStepOut)
def get_traveler_step(step_id: int, db: Session = Depends(get_db)):
    s = db.get(ShopTravelerStep, step_id)
    if not s:
        raise HTTPException(status_code=404, detail="Step not found")
    return s

@steps_router.put("/{step_id}", response_model=ShopTravelerStepOut)
def update_traveler_step(step_id: int, payload: ShopTravelerStepUpdate, db: Session = Depends(get_db)):
    s = db.get(ShopTravelerStep, step_id)
    if not s:
        raise HTTPException(status_code=404, detail="Step not found")

    data = payload.dict(exclude_unset=True)

    # ถ้าอัปเดต seq → ต้องไม่ชนใน traveler เดียวกัน
    if "seq" in data and data["seq"] is not None and data["seq"] != s.seq:
        dup = db.query(ShopTravelerStep).filter(
            ShopTravelerStep.traveler_id == s.traveler_id,
            ShopTravelerStep.seq == data["seq"]
        ).first()
        if dup:
            raise HTTPException(status_code=409, detail="This seq already exists in traveler")

    # ถ้าตั้ง operator ใหม่
    if "operator_id" in data and data["operator_id"] is not None:
        if not db.get(Employee, data["operator_id"]):
            raise HTTPException(status_code=404, detail="Operator not found")

    for k, v in data.items():
        setattr(s, k, v)

    db.commit(); db.refresh(s)
    return s

@steps_router.delete("/{step_id}")
def delete_traveler_step(step_id: int, db: Session = Depends(get_db)):
    s = db.get(ShopTravelerStep, step_id)
    if not s:
        raise HTTPException(status_code=404, detail="Step not found")
    db.delete(s); db.commit()
    return {"message": "Step deleted"}


# ---------- Actions: start / finish ----------
@steps_router.post("/{step_id}/start", response_model=ShopTravelerStepOut)
def start_step(step_id: int, db: Session = Depends(get_db)):
    s = db.get(ShopTravelerStep, step_id)
    if not s:
        raise HTTPException(status_code=404, detail="Step not found")
    s.status = "running"
    s.started_at = datetime.utcnow()
    db.commit(); db.refresh(s)
    return s

@steps_router.post("/{step_id}/finish", response_model=ShopTravelerStepOut)
def finish_step(step_id: int, result: str = "passed", qa_result: str | None = None, qa_notes: str | None = None, db: Session = Depends(get_db)):
    s = db.get(ShopTravelerStep, step_id)
    if not s:
        raise HTTPException(status_code=404, detail="Step not found")
    if result not in ["passed", "failed", "skipped"]:
        raise HTTPException(status_code=400, detail="result must be passed/failed/skipped")
    s.status = result
    s.finished_at = datetime.utcnow()
    if qa_result is not None:
        s.qa_result = qa_result
    if qa_notes is not None:
        s.qa_notes = qa_notes
    db.commit(); db.refresh(s)
    return s

app.include_router(travelers_router)
app.include_router(steps_router)
# #---------------- Products ----------------

# @app.get("/products", response_class=HTMLResponse)
# def list_products(request: Request, db: Session = Depends(get_db)):
#     products = db.query(Product).all()
#     return templates.TemplateResponse("products.html", {"request": request, "products": products})


# @app.get("/product/{product_id}", response_class=HTMLResponse)
# def view_product(product_id: int, request: Request, db: Session = Depends(get_db)):
#     product = db.query(Product).filter(Product.product_id == product_id).first()
#     if not product:
#         return HTMLResponse(content="ไม่พบสินค้า", status_code=404)
#     return templates.TemplateResponse("product_detail.html", {"request": request, "product": product})


# @app.get("/add-product", response_class=HTMLResponse)
# def add_product_form(request: Request):
#     return templates.TemplateResponse("add_product.html", {"request": request})

# @app.post("/add-product")
# def create_product(
#     product_name: str = Form(...),
#     product_type: str = Form(""),
#     price: float = Form(0.0),
#     quantity: int = Form(0),
#     db: Session = Depends(get_db)
# ):
#     new_product = Product(
#         product_name=product_name,
#         product_type=product_type,
#         price=price,
#         quantity=quantity
#     )
#     db.add(new_product)
#     db.commit()
#     return RedirectResponse(url="/add-product", status_code=303)


# # แสดงฟอร์มแก้ไขสินค้า
# @app.get("/product/{product_id}/edit", response_class=HTMLResponse)
# def edit_product_form(product_id: int, request: Request, db: Session = Depends(get_db)):
#     product = db.query(Product).filter(Product.product_id == product_id).first()
#     if not product:
#         return HTMLResponse("ไม่พบสินค้า", status_code=404)
#     return templates.TemplateResponse("edit_product.html", {"request": request, "product": product})

# # รับข้อมูลแก้ไขสินค้า
# @app.post("/product/{product_id}/edit")
# def edit_product(product_id: int, request: Request, 
#                  product_name: str = Form(...),
#                  product_type: str = Form(...),
#                  price: float = Form(...),
#                  quantity: int = Form(...),
#                  db: Session = Depends(get_db)):
#     product = db.query(Product).filter(Product.product_id == product_id).first()
#     if product:
#         product.product_name = product_name
#         product.product_type = product_type
#         product.price = price
#         product.quantity = quantity
#         db.commit()
#     return RedirectResponse(url=f"/product/{product_id}", status_code=303)

# @app.put("/products/{product_id}")
# def update_product(product_id: int, updated: dict, db: Session = Depends(get_db)):
#     product = db.query(Product).filter(Product.product_id == product_id).first()
#     if not product:
#         return {"error": "ไม่พบสินค้า"}

#     product.product_name = updated.get("product_name", product.product_name)
#     product.product_type = updated.get("product_type", product.product_type)
#     product.price = updated.get("price", product.price)
#     product.quantity = updated.get("quantity", product.quantity)

#     db.commit()
#     return {"message": "อัปเดตเรียบร้อย"}


# ลบสินค้า
# @app.post("/product/{product_id}/delete")
# def delete_product(product_id: int, db: Session = Depends(get_db)):
#     product = db.query(Product).filter(Product.product_id == product_id).first()
#     if product:
#         db.delete(product)
#         db.commit()
#     return RedirectResponse(url="/products", status_code=303)



# @app.get("/generate_qr/{product_id}")
# def get_qr_code(product_id: str):
#     file_path = generate_qr_with_product_url(product_id)
#     return FileResponse(file_path, media_type="image/png")

# from crud import delete_product_and_qr

# @app.delete("/products/{product_id}")
# def delete_product(product_id: int, db: Session = Depends(get_db)):
#     return delete_product_and_qr(product_id, db)

# # ✅ เสิร์ฟ index.html ถ้ามี (optional)
# @app.get("/")
# def serve_index():
#     return FileResponse("static/index.html")

# # ✅ Root message
# @app.get("/")
# def read_root():
#     return {"message": "🚀 FastAPI QR Scanner Ready!"}

# ✅ Endpoint รับข้อมูล QR code
# @app.post("/scan")
# def handle_qr(qr: QRData):
#     print(f"📥 ข้อมูลที่สแกน: {qr.data}")

#     if qr.data == "P001":
#         return {"message": "พบสินค้า: น้ำปลา"}
#     elif qr.data.startswith("USER_"):
#         return {"message": f"QR ผู้ใช้: {qr.data}"}
#     else:
#         return {"message": f"QR ที่สแกน: {qr.data}"}
    
# @app.get("/scan")
# def handle_scan(data: str = Query(...)):
#     print(f"📥 ข้อมูลที่สแกน: {data}")
#     # ตอบกลับ
#     if data == "P001":
#         return {"message": "Found item: computer"}
#     elif data.startswith("USER_"):
#         return {"message": f"QR ผู้ใช้: {data}"}
#     else:
#         return {"message": f"QR ที่สแกน: {data}"}

# # ✅ Endpoint เพิ่มผู้ใช้
# @app.post("/users/")
# def create_user(name: str, email: str, db: Session = Depends(get_db)):
#     return crud.create_user(db, name, email)

# # ✅ Endpoint อ่านรายชื่อผู้ใช้ทั้งหมด
# @app.get("/users/")
# def read_users(db: Session = Depends(get_db)):
#     return crud.get_users(db)
