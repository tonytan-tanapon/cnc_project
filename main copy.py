# main.py (organized CRUD API)
from __future__ import annotations

from fastapi import FastAPI, Depends, HTTPException, APIRouter, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import StreamingResponse

from sqlalchemy.orm import Session
from sqlalchemy import func, text
from sqlalchemy.exc import IntegrityError

from datetime import datetime, date, timedelta
from decimal import Decimal
from typing import List, Optional, Literal
import re

# --- Local utils & DB ---
from utils.code_generator import next_code, next_code_yearly
from database import SessionLocal, engine, get_db

# --- ORM models ---
from models import (
    Base,
    # master
    Supplier, Customer, PO, Employee, User,
    # materials
    RawMaterial, RawBatch,
    # parts/lots
    Part, PartRevision, ProductionLot, LotMaterialUse,
    # traveler
    ShopTraveler, ShopTravelerStep,
    # subcon
    SubconOrder, SubconOrderLine,
    SubconShipment, SubconShipmentItem,
    SubconReceipt, SubconReceiptItem,
)

# --- Pydantic Schemas (DTOs) ---
from schemas import (
    # customers
    CustomerCreate, CustomerUpdate, CustomerOut,
    # POs
    POCreate, POUpdate, POOut,
    # employees
    EmployeeCreate, EmployeeUpdate, EmployeeOut,
    # materials
    RawMaterialCreate, RawMaterialUpdate, RawMaterialOut,
    # batches
    RawBatchCreate, RawBatchUpdate, RawBatchOut,
    # lots
    ProductionLotCreate, ProductionLotUpdate, ProductionLotOut,
    # lot uses
    LotMaterialUseCreate, LotMaterialUseUpdate, LotMaterialUseOut,
    # traveler
    ShopTravelerCreate, ShopTravelerUpdate, ShopTravelerOut,
    # steps
    ShopTravelerStepCreate, ShopTravelerStepUpdate, ShopTravelerStepOut,
    # suppliers
    SupplierCreate, SupplierUpdate, SupplierOut,
    # subcon orders
    SubconOrderCreate, SubconOrderUpdate, SubconOrderOut,
    # subcon shipments/receipts (create/out only in schemas)
    SubconShipmentCreate, SubconShipmentOut,
    SubconReceiptCreate, SubconReceiptOut,
)

# ------------------------------
# App bootstrap
# ------------------------------
Base.metadata.create_all(bind=engine)

app = FastAPI(title="MFG API", version="1.0")

origins = [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "http://127.0.0.1:3000",
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static & templates (optional)
try:
    app.mount("/static", StaticFiles(directory="static"), name="static")
    templates = Jinja2Templates(directory="templates")
except Exception:  # pragma: no cover
    templates = None

from fastapi.responses import HTMLResponse, RedirectResponse
@app.get("/", include_in_schema=False)
def root():
    # เปิด / แล้วให้ไป login (ง่ายสุด)
    return RedirectResponse(url="/login")

@app.get("/login", include_in_schema=False)
def login_page():
    return RedirectResponse(url="/static/login.html")


@app.get("/time-clock", include_in_schema=False)
def time_clock_page():
    return RedirectResponse(url="/static/time_clock.html")

@app.get("/index", include_in_schema=False)
def time_clock_page():
    return RedirectResponse(url="/static/travelers.html")

@app.get("/index", include_in_schema=False)
def time_clock_page():
    return RedirectResponse(url="/static/traveler_steps.html")

# @app.get("/", response_class=HTMLResponse)
# def home(request: Request):
#     if not templates:
#         return HTMLResponse("<h3>MFG API is running</h3>", status_code=200)
#     return templates.TemplateResponse("login.html", {"request": request})
#     # return templates.TemplateResponse("index.html", {"request": request})


ui_router = APIRouter(prefix="/ui", tags=["ui"])
templates = Jinja2Templates(directory="templates")

@ui_router.get("/travelers", response_class=HTMLResponse)
def ui_travelers(request: Request):
    # หน้า list ทั้งหมด
    return templates.TemplateResponse("travelers.html", {"request": request})

@ui_router.get("/travelers/{traveler_id}/steps", response_class=HTMLResponse)
def ui_traveler_steps(traveler_id: int, request: Request):
    # หน้า list steps ของ traveler_id
    return templates.TemplateResponse(
        "traveler_steps.html",
        {"request": request, "traveler_id": traveler_id}
    )

# ------------------------------
# Helpers
# ------------------------------

def next_customer_code(db: Session, prefix: str = "C", width: int = 4) -> str:
    """Generate next sequential customer code like C0001, C0002 ..."""
    pat = re.compile(rf"^{re.escape(prefix)}(\d+)$")
    max_n = 0
    rows = db.query(Customer.code).filter(Customer.code.like(f"{prefix}%")).all()
    for (code,) in rows:
        if not code:
            continue
        m = pat.match(code)
        if m:
            n = int(m.group(1))
            if n > max_n:
                max_n = n
    return f"{prefix}{str(max_n + 1).zfill(width)}"


# =====================================================================
# Customers
# =====================================================================

cust_router = APIRouter(prefix="/customers", tags=["customers"])


class CustomerOp(  # for bulk ops via Excel/CSV-like payloads
    # Kept inline to avoid expanding schemas module
    __import__("pydantic").BaseModel  # type: ignore
):
    op: Literal["I", "U", "D"]
    id: Optional[int] = None
    code: Optional[str] = None
    name: Optional[str] = None
    contact: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None


class CustomerOpResult(
    __import__("pydantic").BaseModel  # type: ignore
):
    row: int
    status: Literal["ok", "error"]
    id: Optional[int] = None
    message: Optional[str] = None


@cust_router.get("/export", response_model=List[CustomerOut])
def export_customers(q: str | None = Query(None), db: Session = Depends(get_db)):
    query = db.query(Customer)
    if q:
        ql = f"%{q}%"
        query = query.filter((Customer.code.ilike(ql)) | (Customer.name.ilike(ql)))
    return query.order_by(Customer.id.asc()).all()


@cust_router.post("/bulk", response_model=List[CustomerOpResult])
def bulk_customers(ops: List[CustomerOp], db: Session = Depends(get_db)):
    results: List[CustomerOpResult] = []
    try:
        for idx, op in enumerate(ops, start=1):
            try:
                if op.op == "D":
                    if not op.id:
                        raise HTTPException(400, "id required for delete")
                    c = db.get(Customer, op.id)
                    if not c:
                        raise HTTPException(404, "Customer not found")
                    if c.pos:
                        raise HTTPException(400, "Customer has POs; cannot delete")
                    db.delete(c)
                    db.flush()
                    results.append(CustomerOpResult(row=idx, status="ok", id=op.id))

                elif op.op == "I":
                    code = (op.code or "").strip().upper()
                    autogen = code in ("", "AUTO", "AUTOGEN")
                    code = next_code(db, Customer, "code", prefix="C", width=4) if autogen else code
                    if db.query(Customer).filter(Customer.code == code).first():
                        raise HTTPException(409, "Customer code already exists")

                    c = Customer(
                        code=code,
                        name=(op.name or "").strip(),
                        contact=op.contact,
                        email=op.email,
                        phone=op.phone,
                        address=op.address,
                    )
                    if not c.name:
                        raise HTTPException(400, "'name' is required")
                    db.add(c)
                    db.flush()
                    results.append(CustomerOpResult(row=idx, status="ok", id=c.id))

                elif op.op == "U":
                    if not op.id:
                        raise HTTPException(400, "id required for update")
                    c = db.get(Customer, op.id)
                    if not c:
                        raise HTTPException(404, "Customer not found")

                    if op.code is not None:
                        new_code = (op.code or "").strip().upper()
                        if new_code and new_code != c.code:
                            dup = (
                                db.query(Customer)
                                .filter(Customer.code == new_code, Customer.id != c.id)
                                .first()
                            )
                            if dup:
                                raise HTTPException(409, "Customer code already exists")
                            c.code = new_code

                    for k in ["name", "contact", "email", "phone", "address"]:
                        v = getattr(op, k)
                        if v is not None:
                            setattr(c, k, v.strip() if isinstance(v, str) else v)

                    if not c.name or str(c.name).strip() == "":
                        raise HTTPException(400, "'name' is required")

                    db.flush()
                    results.append(CustomerOpResult(row=idx, status="ok", id=c.id))
                else:
                    raise HTTPException(400, "op must be I/U/D")
            except HTTPException as he:
                results.append(CustomerOpResult(row=idx, status="error", message=he.detail))
        db.commit()
    except Exception:
        db.rollback()
        raise
    return results


@cust_router.post("", response_model=CustomerOut)
def create_customer(payload: CustomerCreate, db: Session = Depends(get_db)):
    raw = (payload.code or "").strip().upper()
    autogen = raw in ("", "AUTO", "AUTOGEN")
    code = next_code(db, Customer, "code", prefix="C", width=4) if autogen else raw

    if db.query(Customer).filter(Customer.code == code).first():
        raise HTTPException(409, "Customer code already exists")

    c = Customer(
        code=code,
        name=payload.name.strip(),
        contact=payload.contact,
        email=payload.email,
        phone=payload.phone,
        address=payload.address,
    )

    for _ in range(3):
        try:
            db.add(c)
            db.commit()
            db.refresh(c)
            return c
        except IntegrityError:
            db.rollback()
            if autogen:
                c.code = next_customer_code(db, prefix="C", width=4)
            else:
                raise HTTPException(409, "Customer code already exists")

    raise HTTPException(500, "Failed to generate unique customer code")


@cust_router.get("/next-code")
def get_next_customer_code(prefix: str = "C", width: int = 4, db: Session = Depends(get_db)):
    return {"next_code": next_customer_code(db, prefix, width)}


@cust_router.get("", response_model=List[CustomerOut])
def list_customers(q: str | None = Query(None), db: Session = Depends(get_db)):
    query = db.query(Customer)
    if q:
        ql = f"%{q}%"
        query = query.filter((Customer.code.ilike(ql)) | (Customer.name.ilike(ql)))
    return query.order_by(Customer.id.desc()).all()


@cust_router.get("/{customer_id}", response_model=CustomerOut)
def get_customer(customer_id: int, db: Session = Depends(get_db)):
    c = db.get(Customer, customer_id)
    if not c:
        raise HTTPException(404, "Customer not found")
    return c


@cust_router.put("/{customer_id}", response_model=CustomerOut)
def update_customer(customer_id: int, payload: CustomerUpdate, db: Session = Depends(get_db)):
    c = db.get(Customer, customer_id)
    if not c:
        raise HTTPException(404, "Customer not found")
    for k, v in payload.dict(exclude_unset=True).items():
        setattr(c, k, v)
    db.commit()
    db.refresh(c)
    return c


@cust_router.delete("/{customer_id}")
def delete_customer(customer_id: int, db: Session = Depends(get_db)):
    c = db.get(Customer, customer_id)
    if not c:
        raise HTTPException(404, "Customer not found")
    if c.pos:
        raise HTTPException(400, "Customer has POs; cannot delete")
    db.delete(c)
    db.commit()
    return {"message": "Customer deleted"}


app.include_router(cust_router)


# =====================================================================
# POs
# =====================================================================

pos_router = APIRouter(prefix="/pos", tags=["pos"])


@pos_router.post("", response_model=POOut)
def create_po(payload: POCreate, db: Session = Depends(get_db)):
    raw = (payload.po_number or "").strip().upper()
    autogen = raw in ("", "AUTO", "AUTOGEN")
    po_no = next_code_yearly(db, PO, "po_number", prefix="PO") if autogen else raw
    if db.query(PO).filter(PO.po_number == po_no).first():
        raise HTTPException(409, "PO number already exists")

    if not db.get(Customer, payload.customer_id):
        raise HTTPException(400, "customer_id not found")

    po = PO(po_number=po_no, description=payload.description, customer_id=payload.customer_id)

    for _ in range(3):
        try:
            db.add(po)
            db.commit()
            db.refresh(po)
            return po
        except IntegrityError:
            db.rollback()
            if autogen:
                po.po_number = next_code_yearly(db, PO, "po_number", prefix="PO")
            else:
                raise HTTPException(409, "PO number already exists")

    raise HTTPException(500, "Failed to generate unique PO number")


@pos_router.get("", response_model=List[POOut])
def list_pos(db: Session = Depends(get_db)):
    return db.query(PO).order_by(PO.id.desc()).all()


@pos_router.get("/{po_id}", response_model=POOut)
def get_po(po_id: int, db: Session = Depends(get_db)):
    po = db.get(PO, po_id)
    if not po:
        raise HTTPException(404, "PO not found")
    return po


@pos_router.put("/{po_id}", response_model=POOut)
def update_po(po_id: int, payload: POUpdate, db: Session = Depends(get_db)):
    po = db.get(PO, po_id)
    if not po:
        raise HTTPException(404, "PO not found")
    data = payload.dict(exclude_unset=True)
    if "po_number" in data and data["po_number"]:
        new_no = data["po_number"].strip().upper()
        dup = db.query(PO).filter(PO.po_number == new_no, PO.id != po_id).first()
        if dup:
            raise HTTPException(409, "PO number already exists")
        po.po_number = new_no
        del data["po_number"]
    if "customer_id" in data and data["customer_id"] is not None:
        if not db.get(Customer, data["customer_id"]):
            raise HTTPException(400, "customer_id not found")
    for k, v in data.items():
        setattr(po, k, v)
    db.commit()
    db.refresh(po)
    return po


@pos_router.delete("/{po_id}")
def delete_po(po_id: int, db: Session = Depends(get_db)):
    po = db.get(PO, po_id)
    if not po:
        raise HTTPException(404, "PO not found")
    if po.lots:
        raise HTTPException(400, "PO has lots; cannot delete")
    db.delete(po)
    db.commit()
    return {"message": "PO deleted"}


app.include_router(pos_router)


# =====================================================================
# Employees
# =====================================================================

emp_router = APIRouter(prefix="/employees", tags=["employees"])


@emp_router.post("", response_model=EmployeeOut)
def create_employee(payload: EmployeeCreate, db: Session = Depends(get_db)):
    raw_code = (payload.emp_code or "").strip().upper()
    autogen = raw_code in ("", "AUTO", "AUTOGEN")
    emp_code = next_code_yearly(db, Employee, "emp_code", prefix="EMP") if autogen else raw_code

    if db.query(Employee).filter(Employee.emp_code == emp_code).first():
        raise HTTPException(status_code=409, detail="Employee code already exists")

    emp = Employee(
        emp_code=emp_code,
        name=payload.name,
        position=payload.position,
        department=payload.department,
        email=payload.email,
        phone=payload.phone,
        status=payload.status or "active",
    )

    db.add(emp)
    db.commit()
    db.refresh(emp)
    return emp


@emp_router.get("", response_model=List[EmployeeOut])
def list_employees(db: Session = Depends(get_db)):
    return db.query(Employee).order_by(Employee.id.desc()).all()


@emp_router.get("/{emp_id}", response_model=EmployeeOut)
def get_employee(emp_id: int, db: Session = Depends(get_db)):
    e = db.get(Employee, emp_id)
    if not e:
        raise HTTPException(404, "Employee not found")
    return e


@emp_router.put("/{emp_id}", response_model=EmployeeOut)
def update_employee(emp_id: int, payload: EmployeeUpdate, db: Session = Depends(get_db)):
    e = db.get(Employee, emp_id)
    if not e:
        raise HTTPException(404, "Employee not found")
    for k, v in payload.dict(exclude_unset=True).items():
        setattr(e, k, v)
    db.commit()
    db.refresh(e)
    return e


@emp_router.delete("/{emp_id}")
def delete_employee(emp_id: int, db: Session = Depends(get_db)):
    e = db.get(Employee, emp_id)
    if not e:
        raise HTTPException(404, "Employee not found")
    db.delete(e)
    db.commit()
    return {"message": "Employee deleted"}


app.include_router(emp_router)


# =====================================================================
# Raw Materials
# =====================================================================

materials_router = APIRouter(prefix="/materials", tags=["materials"])


@materials_router.post("", response_model=RawMaterialOut)
def create_material(payload: RawMaterialCreate, db: Session = Depends(get_db)):
    code = payload.code.strip().upper()
    if db.query(RawMaterial).filter(RawMaterial.code == code).first():
        raise HTTPException(409, "Material code already exists")
    m = RawMaterial(
        code=code,
        name=payload.name.strip(),
        spec=payload.spec,
        uom=payload.uom,
        remark=payload.remark,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


@materials_router.get("", response_model=List[RawMaterialOut])
def list_materials(db: Session = Depends(get_db)):
    return db.query(RawMaterial).order_by(RawMaterial.id.desc()).all()


@materials_router.get("/{mat_id}", response_model=RawMaterialOut)
def get_material(mat_id: int, db: Session = Depends(get_db)):
    m = db.get(RawMaterial, mat_id)
    if not m:
        raise HTTPException(404, "Material not found")
    return m


@materials_router.put("/{mat_id}", response_model=RawMaterialOut)
def update_material(mat_id: int, payload: RawMaterialUpdate, db: Session = Depends(get_db)):
    m = db.get(RawMaterial, mat_id)
    if not m:
        raise HTTPException(404, "Material not found")
    for k, v in payload.dict(exclude_unset=True).items():
        setattr(m, k, v)
    db.commit()
    db.refresh(m)
    return m


@materials_router.delete("/{mat_id}")
def delete_material(mat_id: int, db: Session = Depends(get_db)):
    m = db.get(RawMaterial, mat_id)
    if not m:
        raise HTTPException(404, "Material not found")
    if m.batches:
        raise HTTPException(400, "Material has batches; cannot delete")
    db.delete(m)
    db.commit()
    return {"message": "Material deleted"}


app.include_router(materials_router)


# =====================================================================
# Raw Batches
# =====================================================================

batches_router = APIRouter(prefix="/batches", tags=["batches"])


@batches_router.post("", response_model=RawBatchOut)
def create_batch(payload: RawBatchCreate, db: Session = Depends(get_db)):
    if not db.get(RawMaterial, payload.material_id):
        raise HTTPException(404, "Material not found")

    b = RawBatch(
        material_id=payload.material_id,
        batch_no=payload.batch_no.strip(),
        supplier_id=payload.supplier_id,
        supplier_batch_no=payload.supplier_batch_no,
        mill_name=payload.mill_name,
        mill_heat_no=payload.mill_heat_no,
        received_at=payload.received_at,
        qty_received=payload.qty_received,
        qty_used=Decimal("0"),
        cert_file=payload.cert_file,
        location=payload.location,
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    return b


@batches_router.get("", response_model=List[RawBatchOut])
def list_batches(db: Session = Depends(get_db)):
    return db.query(RawBatch).order_by(RawBatch.id.desc()).all()


@batches_router.get("/{batch_id}", response_model=RawBatchOut)
def get_batch(batch_id: int, db: Session = Depends(get_db)):
    b = db.get(RawBatch, batch_id)
    if not b:
        raise HTTPException(404, "Batch not found")
    return b


@batches_router.put("/{batch_id}", response_model=RawBatchOut)
def update_batch(batch_id: int, payload: RawBatchUpdate, db: Session = Depends(get_db)):
    b = db.get(RawBatch, batch_id)
    if not b:
        raise HTTPException(404, "Batch not found")
    data = payload.dict(exclude_unset=True)

    if "qty_received" in data and data["qty_received"] is not None:
        new_recv = Decimal(str(data["qty_received"]))
        if new_recv < b.qty_used:
            raise HTTPException(400, "qty_received cannot be less than qty_used")
        b.qty_received = new_recv
        del data["qty_received"]

    for k, v in data.items():
        setattr(b, k, v)

    db.commit()
    db.refresh(b)
    return b


@batches_router.delete("/{batch_id}")
def delete_batch(batch_id: int, db: Session = Depends(get_db)):
    b = db.get(RawBatch, batch_id)
    if not b:
        raise HTTPException(404, "Batch not found")
    if b.qty_used > 0 or (b.uses and len(b.uses) > 0):
        raise HTTPException(400, "Batch already used; cannot delete")
    db.delete(b)
    db.commit()
    return {"message": "Batch deleted"}


app.include_router(batches_router)


# =====================================================================
# Production Lots
# =====================================================================

lots_router = APIRouter(prefix="/lots", tags=["lots"])


@lots_router.post("", response_model=ProductionLotOut)
def create_lot(payload: ProductionLotCreate, db: Session = Depends(get_db)):
    if payload.po_id is not None and not db.get(PO, payload.po_id):
        raise HTTPException(404, "PO not found")
    if db.query(ProductionLot).filter(ProductionLot.lot_no == payload.lot_no).first():
        raise HTTPException(409, "Lot number already exists")

    # validate part & revision
    part = db.get(Part, payload.part_id)
    if not part:
        raise HTTPException(404, "Part not found")
    if payload.part_revision_id is not None:
        prv = db.get(PartRevision, payload.part_revision_id)
        if not prv or prv.part_id != part.id:
            raise HTTPException(400, "part_revision_id does not belong to part_id")

    lot = ProductionLot(
        lot_no=payload.lot_no.strip(),
        part_id=payload.part_id,
        part_revision_id=payload.part_revision_id,
        po_id=payload.po_id,
        planned_qty=payload.planned_qty,
        started_at=payload.started_at,
        finished_at=payload.finished_at,
        status=payload.status or "in_process",
    )
    db.add(lot)
    db.commit()
    db.refresh(lot)
    return lot


@lots_router.get("", response_model=List[ProductionLotOut])
def list_lots(db: Session = Depends(get_db)):
    return db.query(ProductionLot).order_by(ProductionLot.id.desc()).all()


@lots_router.get("/{lot_id}", response_model=ProductionLotOut)
def get_lot(lot_id: int, db: Session = Depends(get_db)):
    lot = db.get(ProductionLot, lot_id)
    if not lot:
        raise HTTPException(404, "Lot not found")
    return lot


@lots_router.put("/{lot_id}", response_model=ProductionLotOut)
def update_lot(lot_id: int, payload: ProductionLotUpdate, db: Session = Depends(get_db)):
    lot = db.get(ProductionLot, lot_id)
    if not lot:
        raise HTTPException(404, "Lot not found")
    data = payload.dict(exclude_unset=True)

    if "po_id" in data and data["po_id"] is not None:
        if not db.get(PO, data["po_id"]):
            raise HTTPException(404, "PO not found")

    if "part_id" in data and data["part_id"] is not None:
        if not db.get(Part, data["part_id"]):
            raise HTTPException(404, "Part not found")

    if "part_revision_id" in data and data["part_revision_id"] is not None:
        prv = db.get(PartRevision, data["part_revision_id"])  # type: ignore[index]
        if not prv:
            raise HTTPException(404, "Part revision not found")
        # ensure consistency if part_id also changing/exists
        part_id = data.get("part_id", lot.part_id)
        if prv.part_id != part_id:
            raise HTTPException(400, "part_revision_id does not belong to part_id")

    for k, v in data.items():
        setattr(lot, k, v)

    db.commit()
    db.refresh(lot)
    return lot


@lots_router.delete("/{lot_id}")
def delete_lot(lot_id: int, db: Session = Depends(get_db)):
    lot = db.get(ProductionLot, lot_id)
    if not lot:
        raise HTTPException(404, "Lot not found")
    if lot.material_uses and len(lot.material_uses) > 0:
        raise HTTPException(400, "Lot has material usage; cannot delete")
    db.delete(lot)
    db.commit()
    return {"message": "Lot deleted"}


app.include_router(lots_router)


# =====================================================================
# Lot Material Use
# =====================================================================

def assert_batch_capacity(batch: RawBatch, qty_delta: Decimal):
    if (batch.qty_used + qty_delta) > batch.qty_received:
        raise HTTPException(400, "Not enough batch balance")


lotuse_router = APIRouter(prefix="/lot-uses", tags=["lot_uses"])


@lotuse_router.post("", response_model=LotMaterialUseOut)
def create_lot_use(payload: LotMaterialUseCreate, db: Session = Depends(get_db)):
    lot = db.get(ProductionLot, payload.lot_id)
    batch = db.get(RawBatch, payload.batch_id)
    if not lot:
        raise HTTPException(404, "Lot not found")
    if not batch:
        raise HTTPException(404, "Batch not found")
    qty = Decimal(str(payload.qty))
    if qty <= 0:
        raise HTTPException(400, "qty must be > 0")

    assert_batch_capacity(batch, qty)
    use = LotMaterialUse(lot_id=lot.id, batch_id=batch.id, qty=qty)
    batch.qty_used = batch.qty_used + qty
    db.add(use)
    db.commit()
    db.refresh(use)
    return use


@lotuse_router.get("", response_model=List[LotMaterialUseOut])
def list_lot_uses(db: Session = Depends(get_db)):
    return db.query(LotMaterialUse).order_by(LotMaterialUse.id.desc()).all()


@lotuse_router.get("/{use_id}", response_model=LotMaterialUseOut)
def get_lot_use(use_id: int, db: Session = Depends(get_db)):
    u = db.get(LotMaterialUse, use_id)
    if not u:
        raise HTTPException(404, "Usage not found")
    return u


@lotuse_router.put("/{use_id}", response_model=LotMaterialUseOut)
def update_lot_use(use_id: int, payload: LotMaterialUseUpdate, db: Session = Depends(get_db)):
    u = db.get(LotMaterialUse, use_id)
    if not u:
        raise HTTPException(404, "Usage not found")
    new_qty = Decimal(str(payload.qty))
    if new_qty <= 0:
        raise HTTPException(400, "qty must be > 0")

    batch = db.get(RawBatch, u.batch_id)
    delta = new_qty - u.qty
    if delta != 0:
        assert_batch_capacity(batch, delta)  # type: ignore[arg-type]
        u.qty = new_qty
        batch.qty_used = batch.qty_used + delta  # type: ignore[operator]
    db.commit()
    db.refresh(u)
    return u


@lotuse_router.delete("/{use_id}")
def delete_lot_use(use_id: int, db: Session = Depends(get_db)):
    u = db.get(LotMaterialUse, use_id)
    if not u:
        raise HTTPException(404, "Usage not found")
    batch = db.get(RawBatch, u.batch_id)
    batch.qty_used = batch.qty_used - u.qty  # type: ignore[operator]
    db.delete(u)
    db.commit()
    return {"message": "Usage deleted"}


app.include_router(lotuse_router)


# =====================================================================
# Shop Travelers & Steps
# =====================================================================

travelers_router = APIRouter(prefix="/travelers", tags=["travelers"])
steps_router = APIRouter(prefix="/traveler-steps", tags=["traveler_steps"])


@travelers_router.post("", response_model=ShopTravelerOut)
def create_traveler(payload: ShopTravelerCreate, db: Session = Depends(get_db)):
    lot = db.get(ProductionLot, payload.lot_id)
    if not lot:
        raise HTTPException(404, "Lot not found")
    # NOTE: allow multiple travelers per lot; no unique check here
    if payload.created_by_id and not db.get(Employee, payload.created_by_id):
        raise HTTPException(404, "Creator employee not found")
    t = ShopTraveler(
        lot_id=payload.lot_id,
        created_by_id=payload.created_by_id,
        status=payload.status or "open",
        notes=payload.notes,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


@travelers_router.get("", response_model=List[ShopTravelerOut])
def list_travelers(db: Session = Depends(get_db)):
    return db.query(ShopTraveler).order_by(ShopTraveler.id.desc()).all()


@travelers_router.get("/{traveler_id}", response_model=ShopTravelerOut)
def get_traveler(traveler_id: int, db: Session = Depends(get_db)):
    t = db.get(ShopTraveler, traveler_id)
    if not t:
        raise HTTPException(404, "Traveler not found")
    return t


@travelers_router.put("/{traveler_id}", response_model=ShopTravelerOut)
def update_traveler(traveler_id: int, payload: ShopTravelerUpdate, db: Session = Depends(get_db)):
    t = db.get(ShopTraveler, traveler_id)
    if not t:
        raise HTTPException(404, "Traveler not found")
    data = payload.dict(exclude_unset=True)
    if "created_by_id" in data and data["created_by_id"] is not None:
        if not db.get(Employee, data["created_by_id"]):
            raise HTTPException(404, "Creator employee not found")
    for k, v in data.items():
        setattr(t, k, v)
    db.commit()
    db.refresh(t)
    return t


@travelers_router.delete("/{traveler_id}")
def delete_traveler(traveler_id: int, db: Session = Depends(get_db)):
    t = db.get(ShopTraveler, traveler_id)
    if not t:
        raise HTTPException(404, "Traveler not found")
    if t.steps and len(t.steps) > 0:
        raise HTTPException(400, "Traveler has steps; cannot delete")
    db.delete(t)
    db.commit()
    return {"message": "Traveler deleted"}


# ----- Steps CRUD -----
@steps_router.post("", response_model=ShopTravelerStepOut)
def create_traveler_step(payload: ShopTravelerStepCreate, db: Session = Depends(get_db)):
    t = db.get(ShopTraveler, payload.traveler_id)
    if not t:
        raise HTTPException(404, "Traveler not found")
    if payload.operator_id and not db.get(Employee, payload.operator_id):
        raise HTTPException(404, "Operator not found")
    dup = (
        db.query(ShopTravelerStep)
        .filter(
            ShopTravelerStep.traveler_id == payload.traveler_id,
            ShopTravelerStep.seq == payload.seq,
        )
        .first()
    )
    if dup:
        raise HTTPException(409, "This seq already exists in traveler")
    s = ShopTravelerStep(
        traveler_id=payload.traveler_id,
        seq=payload.seq,
        step_name=payload.step_name,
        step_code=payload.step_code,
        station=payload.station,
        operator_id=payload.operator_id,
        qa_required=payload.qa_required or False,
        status="pending",
    )
    db.add(s)
    db.commit()
    db.refresh(s)
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
        raise HTTPException(404, "Step not found")
    return s


@steps_router.put("/{step_id}", response_model=ShopTravelerStepOut)
def update_traveler_step(step_id: int, payload: ShopTravelerStepUpdate, db: Session = Depends(get_db)):
    s = db.get(ShopTravelerStep, step_id)
    if not s:
        raise HTTPException(404, "Step not found")
    data = payload.dict(exclude_unset=True)

    if "seq" in data and data["seq"] is not None and data["seq"] != s.seq:
        dup = (
            db.query(ShopTravelerStep)
            .filter(ShopTravelerStep.traveler_id == s.traveler_id, ShopTravelerStep.seq == data["seq"])
            .first()
        )
        if dup:
            raise HTTPException(409, "This seq already exists in traveler")

    if "operator_id" in data and data["operator_id"] is not None:
        if not db.get(Employee, data["operator_id"]):
            raise HTTPException(404, "Operator not found")

    for k, v in data.items():
        setattr(s, k, v)
    db.commit()
    db.refresh(s)
    return s


@steps_router.delete("/{step_id}")
def delete_traveler_step(step_id: int, db: Session = Depends(get_db)):
    s = db.get(ShopTravelerStep, step_id)
    if not s:
        raise HTTPException(404, "Step not found")
    db.delete(s)
    db.commit()
    return {"message": "Step deleted"}


# ----- Step actions -----
@steps_router.post("/{step_id}/start", response_model=ShopTravelerStepOut)
def start_step(step_id: int, db: Session = Depends(get_db)):
    s = db.get(ShopTravelerStep, step_id)
    if not s:
        raise HTTPException(404, "Step not found")
    s.status = "running"
    s.started_at = datetime.utcnow()
    db.commit()
    db.refresh(s)
    return s


@steps_router.post("/{step_id}/finish", response_model=ShopTravelerStepOut)
def finish_step(
    step_id: int,
    result: str = "passed",
    qa_result: str | None = None,
    qa_notes: str | None = None,
    db: Session = Depends(get_db),
):
    s = db.get(ShopTravelerStep, step_id)
    if not s:
        raise HTTPException(404, "Step not found")
    if result not in ["passed", "failed", "skipped"]:
        raise HTTPException(400, "result must be passed/failed/skipped")
    s.status = result
    s.finished_at = datetime.utcnow()
    if qa_result is not None:
        s.qa_result = qa_result
    if qa_notes is not None:
        s.qa_notes = qa_notes
    db.commit()
    db.refresh(s)
    return s


app.include_router(travelers_router)
app.include_router(steps_router)


# =====================================================================
# Suppliers
# =====================================================================

suppliers_router = APIRouter(prefix="/suppliers", tags=["suppliers"])


@suppliers_router.post("", response_model=SupplierOut)
def create_supplier(payload: SupplierCreate, db: Session = Depends(get_db)):
    code = payload.code.strip().upper()
    if db.query(Supplier).filter(Supplier.code == code).first():
        raise HTTPException(409, "Supplier code already exists")
    s = Supplier(
        code=code,
        name=payload.name.strip(),
        contact=payload.contact,
        email=payload.email,
        phone=payload.phone,
        address=payload.address,
        payment_terms=payload.payment_terms,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@suppliers_router.get("", response_model=List[SupplierOut])
def list_suppliers(q: str | None = Query(None), db: Session = Depends(get_db)):
    query = db.query(Supplier)
    if q:
        ql = f"%{q}%"
        query = query.filter((Supplier.code.ilike(ql)) | (Supplier.name.ilike(ql)))
    return query.order_by(Supplier.name.asc()).all()


@suppliers_router.get("/{supplier_id}", response_model=SupplierOut)
def get_supplier(supplier_id: int, db: Session = Depends(get_db)):
    s = db.get(Supplier, supplier_id)
    if not s:
        raise HTTPException(404, "Supplier not found")
    return s


@suppliers_router.put("/{supplier_id}", response_model=SupplierOut)
def update_supplier(supplier_id: int, payload: SupplierUpdate, db: Session = Depends(get_db)):
    s = db.get(Supplier, supplier_id)
    if not s:
        raise HTTPException(404, "Supplier not found")
    for k, v in payload.dict(exclude_unset=True).items():
        setattr(s, k, v)
    db.commit()
    db.refresh(s)
    return s


@suppliers_router.delete("/{supplier_id}")
def delete_supplier(supplier_id: int, db: Session = Depends(get_db)):
    s = db.get(Supplier, supplier_id)
    if not s:
        raise HTTPException(404, "Supplier not found")
    if s.raw_batches:
        raise HTTPException(400, "Supplier in use (raw_batches); cannot delete")
    db.delete(s)
    db.commit()
    return {"message": "Supplier deleted"}


app.include_router(suppliers_router)


# =====================================================================
# Subcontracting
# =====================================================================

subcon_router = APIRouter(prefix="/subcon", tags=["subcontracting"])


def assert_supplier_exists(db: Session, supplier_id: int):
    if not db.get(Supplier, supplier_id):
        raise HTTPException(404, "Supplier not found")


def assert_step_exists(db: Session, step_id: int):
    if not db.get(ShopTravelerStep, step_id):
        raise HTTPException(404, f"Traveler step {step_id} not found")


def shipped_qty_for_step(db: Session, order_id: int, step_id: int) -> Decimal:
    total = (
        db.query(func.coalesce(func.sum(SubconShipmentItem.qty), 0))
        .join(SubconShipment, SubconShipmentItem.shipment_id == SubconShipment.id)
        .filter(SubconShipment.order_id == order_id, SubconShipmentItem.traveler_step_id == step_id)
        .scalar()
    )
    return Decimal(total)


def received_qty_for_step(db: Session, order_id: int, step_id: int) -> Decimal:
    total = (
        db.query(func.coalesce(func.sum(SubconReceiptItem.qty_received), 0))
        .join(SubconReceipt, SubconReceiptItem.receipt_id == SubconReceipt.id)
        .filter(SubconReceipt.order_id == order_id, SubconReceiptItem.traveler_step_id == step_id)
        .scalar()
    )
    return Decimal(total)


# ---- Orders ----
@subcon_router.post("/orders", response_model=SubconOrderOut)
def create_subcon_order(payload: SubconOrderCreate, db: Session = Depends(get_db)):
    assert_supplier_exists(db, payload.supplier_id)
    for line in payload.lines:
        assert_step_exists(db, line.traveler_step_id)

    order = SubconOrder(
        supplier_id=payload.supplier_id,
        ref_no=payload.ref_no,
        due_date=payload.due_date,
        notes=payload.notes,
        status="open",
    )
    db.add(order)
    db.flush()

    for line in payload.lines:
        ol = SubconOrderLine(
            order_id=order.id,
            traveler_step_id=line.traveler_step_id,
            qty_planned=line.qty_planned,
            unit_cost=line.unit_cost,
        )
        db.add(ol)

    db.commit()
    db.refresh(order)
    _ = order.lines
    return order


@subcon_router.get("/orders", response_model=List[SubconOrderOut])
def list_subcon_orders(status: str | None = None, supplier_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(SubconOrder)
    if status:
        q = q.filter(SubconOrder.status == status)
    if supplier_id:
        q = q.filter(SubconOrder.supplier_id == supplier_id)
    items = q.order_by(SubconOrder.created_at.desc()).all()
    for o in items:
        _ = o.lines
    return items


@subcon_router.get("/orders/{order_id}", response_model=SubconOrderOut)
def get_subcon_order(order_id: int, db: Session = Depends(get_db)):
    o = db.get(SubconOrder, order_id)
    if not o:
        raise HTTPException(404, "Subcon order not found")
    _ = o.lines
    return o


@subcon_router.put("/orders/{order_id}", response_model=SubconOrderOut)
def update_subcon_order(order_id: int, payload: SubconOrderUpdate, db: Session = Depends(get_db)):
    o = db.get(SubconOrder, order_id)
    if not o:
        raise HTTPException(404, "Subcon order not found")
    data = payload.dict(exclude_unset=True)
    if "supplier_id" in data and data["supplier_id"] is not None:
        assert_supplier_exists(db, data["supplier_id"])
    for k, v in data.items():
        setattr(o, k, v)
    db.commit()
    db.refresh(o)
    _ = o.lines
    return o


# ---- Shipments ----
class SubconShipmentUpdate(__import__("pydantic").BaseModel):  # inline simple DTO
    shipped_at: Optional[datetime] = None
    shipped_by: Optional[str] = None
    package_no: Optional[str] = None
    carrier: Optional[str] = None
    tracking_no: Optional[str] = None
    status: Optional[Literal["shipped", "partially_received", "closed"]] = None


@subcon_router.post("/shipments", response_model=SubconShipmentOut)
def create_shipment(payload: SubconShipmentCreate, db: Session = Depends(get_db)):
    order = db.get(SubconOrder, payload.order_id)
    if not order:
        raise HTTPException(404, "Subcon order not found")
    order_line_steps = {ol.traveler_step_id for ol in order.lines}
    if not order_line_steps:
        raise HTTPException(400, "Order has no lines; cannot ship")

    sh = SubconShipment(
        order_id=payload.order_id,
        shipped_at=payload.shipped_at or datetime.utcnow(),
        shipped_by=payload.shipped_by,
        package_no=payload.package_no,
        carrier=payload.carrier,
        tracking_no=payload.tracking_no,
        status="shipped",
    )
    db.add(sh)
    db.flush()

    for it in payload.items:
        if it.traveler_step_id not in order_line_steps:
            raise HTTPException(400, f"Step {it.traveler_step_id} is not part of this order")
        if it.qty <= 0:
            raise HTTPException(400, "Shipment qty must be > 0")
        db.add(
            SubconShipmentItem(
                shipment_id=sh.id,
                traveler_step_id=it.traveler_step_id,
                qty=it.qty,
            )
        )

    db.commit()
    db.refresh(sh)
    _ = sh.items
    return sh


@subcon_router.get("/shipments", response_model=List[SubconShipmentOut])
def list_shipments(order_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(SubconShipment)
    if order_id:
        q = q.filter(SubconShipment.order_id == order_id)
    items = q.order_by(SubconShipment.shipped_at.desc()).all()
    for it in items:
        _ = it.items
    return items


@subcon_router.get("/shipments/{shipment_id}", response_model=SubconShipmentOut)
def get_shipment(shipment_id: int, db: Session = Depends(get_db)):
    sh = db.get(SubconShipment, shipment_id)
    if not sh:
        raise HTTPException(404, "Shipment not found")
    _ = sh.items
    return sh


@subcon_router.put("/shipments/{shipment_id}", response_model=SubconShipmentOut)
def update_shipment(shipment_id: int, payload: SubconShipmentUpdate, db: Session = Depends(get_db)):
    sh = db.get(SubconShipment, shipment_id)
    if not sh:
        raise HTTPException(404, "Shipment not found")
    data = payload.dict(exclude_unset=True)
    for k, v in data.items():
        setattr(sh, k, v)
    db.commit()
    db.refresh(sh)
    _ = sh.items
    return sh


# ---- Receipts ----
class SubconReceiptUpdate(__import__("pydantic").BaseModel):  # inline simple DTO
    received_at: Optional[datetime] = None
    received_by: Optional[str] = None
    doc_no: Optional[str] = None
    status: Optional[Literal["received", "partial", "rejected"]] = None


@subcon_router.post("/receipts", response_model=SubconReceiptOut)
def create_receipt(payload: SubconReceiptCreate, db: Session = Depends(get_db)):
    order = db.get(SubconOrder, payload.order_id)
    if not order:
        raise HTTPException(404, "Subcon order not found")
    order_line_steps = {ol.traveler_step_id for ol in order.lines}

    rc = SubconReceipt(
        order_id=payload.order_id,
        received_at=payload.received_at or datetime.utcnow(),
        received_by=payload.received_by,
        doc_no=payload.doc_no,
        status="received",
    )
    db.add(rc)
    db.flush()

    for it in payload.items:
        sid = it.traveler_step_id
        if sid not in order_line_steps:
            raise HTTPException(400, f"Step {sid} is not part of this order")

        shipped_total = (
            db.query(func.coalesce(func.sum(SubconShipmentItem.qty), 0))
            .join(SubconShipment, SubconShipmentItem.shipment_id == SubconShipment.id)
            .filter(SubconShipment.order_id == order.id, SubconShipmentItem.traveler_step_id == sid)
            .scalar()
        )
        received_total = (
            db.query(func.coalesce(func.sum(SubconReceiptItem.qty_received), 0))
            .join(SubconReceipt, SubconReceiptItem.receipt_id == SubconReceipt.id)
            .filter(SubconReceipt.order_id == order.id, SubconReceiptItem.traveler_step_id == sid)
            .scalar()
        )
        shipped_total = Decimal(shipped_total or 0)
        received_total = Decimal(received_total or 0)

        if it.qty_received < 0 or it.qty_rejected < 0 or it.scrap_qty < 0:
            raise HTTPException(400, "Quantities must be >= 0")

        if (received_total + Decimal(str(it.qty_received))) > shipped_total:
            raise HTTPException(400, f"Received qty would exceed shipped qty for step {sid}")

        db.add(
            SubconReceiptItem(
                receipt_id=rc.id,
                traveler_step_id=sid,
                qty_received=it.qty_received,
                qty_rejected=it.qty_rejected,
                scrap_qty=it.scrap_qty,
                qa_result=it.qa_result,
                qa_notes=it.qa_notes,
            )
        )

    db.commit()
    db.refresh(rc)
    _ = rc.items
    return rc


@subcon_router.get("/receipts", response_model=List[SubconReceiptOut])
def list_receipts(order_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(SubconReceipt)
    if order_id:
        q = q.filter(SubconReceipt.order_id == order_id)
    items = q.order_by(SubconReceipt.received_at.desc()).all()
    for it in items:
        _ = it.items
    return items


@subcon_router.get("/receipts/{receipt_id}", response_model=SubconReceiptOut)
def get_receipt(receipt_id: int, db: Session = Depends(get_db)):
    rc = db.get(SubconReceipt, receipt_id)
    if not rc:
        raise HTTPException(404, "Receipt not found")
    _ = rc.items
    return rc


@subcon_router.put("/receipts/{receipt_id}", response_model=SubconReceiptOut)
def update_receipt(receipt_id: int, payload: SubconReceiptUpdate, db: Session = Depends(get_db)):
    rc = db.get(SubconReceipt, receipt_id)
    if not rc:
        raise HTTPException(404, "Receipt not found")
    data = payload.dict(exclude_unset=True)
    for k, v in data.items():
        setattr(rc, k, v)
    db.commit()
    db.refresh(rc)
    _ = rc.items
    return rc


app.include_router(subcon_router)


# =====================================================================
# Auth (sample)
# =====================================================================

from deps.auth import login_for_access_token, get_current_user
from deps.authz import require_perm

auth_router = APIRouter(prefix="/auth", tags=["auth"])  # prefixed


@auth_router.post("/token")
def issue_token(resp=Depends(login_for_access_token)):
    return resp


@auth_router.get("/me")
def me(user: User = Depends(get_current_user)):
    return {"id": user.id, "username": user.username, "is_superuser": user.is_superuser}


app.include_router(auth_router)


# =====================================================================
# Payroll (protected by permission)
# =====================================================================

payroll_router = APIRouter(
    prefix="/payroll",
    tags=["payroll"],
    dependencies=[Depends(require_perm("PAYROLL_VIEW"))],
)


@payroll_router.get("/summary")
def payroll_summary(
    start: date | None = None,
    end: date | None = None,
    employee_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    today = date.today()
    if not start:
        start = today.replace(day=1)
    if not end:
        end = (start.replace(day=28) + timedelta(days=4)).replace(day=1)  # first day next month

    sql = text(
        """
        WITH e AS (
            SELECT te.employee_id,
                   te.clock_in_at AT TIME ZONE 'UTC' AS cin,
                   te.clock_out_at AT TIME ZONE 'UTC' AS cout
            FROM time_entries te
            WHERE te.clock_out_at IS NOT NULL
              AND te.clock_in_at >= :start
              AND te.clock_in_at <  :end
              {emp_filter}
        ),
        d AS (
            SELECT employee_id,
                   date_trunc('day', cin) AS day,
                   SUM(EXTRACT(EPOCH FROM (cout - cin))/3600.0) AS h
            FROM e
            GROUP BY employee_id, date_trunc('day', cin)
        ),
        c AS (
            SELECT employee_id,
                   day,
                   CASE WHEN EXTRACT(ISODOW FROM day) IN (6,7) THEN 0 ELSE LEAST(h, 8) END AS reg,
                   CASE WHEN EXTRACT(ISODOW FROM day) IN (6,7) THEN 0 ELSE GREATEST(h-8, 0) END AS ot15,
                   CASE WHEN EXTRACT(ISODOW FROM day) IN (6,7) THEN h ELSE 0 END AS ot20
            FROM d
        )
        SELECT e.id AS employee_id, e.emp_code, e.name,
               COALESCE(SUM(c.reg),0)  AS regular_hours,
               COALESCE(SUM(c.ot15),0) AS ot15_hours,
               COALESCE(SUM(c.ot20),0) AS ot20_hours,
               COALESCE(SUM(c.reg + c.ot15 + c.ot20),0) AS total_hours
        FROM employees e
        LEFT JOIN c ON c.employee_id = e.id
        {emp_join_filter}
        GROUP BY e.id, e.emp_code, e.name
        ORDER BY e.id;
        """.format(
            emp_filter="AND te.employee_id = :emp_id" if employee_id else "",
            emp_join_filter="WHERE e.id = :emp_id" if employee_id else "",
        )
    )

    rows = db.execute(sql, {"start": start, "end": end, "emp_id": employee_id}).mappings().all()
    return [dict(r) for r in rows]


app.include_router(payroll_router)

from routers.time_clock import timeclock_router, breaks_router
app.include_router(timeclock_router)
app.include_router(breaks_router)

# from models import TimeEntry, BreakEntry, Employee, User  # <-- เพิ่ม TimeEntry, BreakEntry ถ้ายังไม่มี
# from deps.auth import get_current_user  # คุณมีอยู่แล้ว
# from pydantic import BaseModel

# # =====================================================================
# # Time Clock API (map User -> Employee อัตโนมัติ)
# # =====================================================================
# timeclock_router = APIRouter(prefix="/time-entries", tags=["time_clock"])

# class StopPayload(BaseModel):
#     method: str | None = None
#     location: str | None = None
#     notes: str | None = None

# @timeclock_router.post("/start")
# def start_time_entry(
#     db: Session = Depends(get_db),
#     user: User = Depends(get_current_user),
# ):
#     # ต้องลิงก์ user กับ employee มาก่อน
#     if not user.employee_id:
#         raise HTTPException(400, "User is not linked to an employee")

#     # ปิด entry ค้าง (กันซ้อนเวลา)
#     open_te = (
#         db.query(TimeEntry)
#         .filter(TimeEntry.employee_id == user.employee_id, TimeEntry.status == "open")
#         .first()
#     )
#     if open_te:
#         open_te.clock_out_at = datetime.utcnow()
#         open_te.status = "closed"
#         db.flush()

#     te = TimeEntry(
#         employee_id=user.employee_id,
#         created_by_user_id=user.id,
#         clock_in_at=datetime.utcnow(),
#         clock_in_method="web",     # จะให้รับจาก frontend ก็ได้
#         clock_in_location=None,
#         status="open",
#     )
#     db.add(te)
#     db.commit()
#     db.refresh(te)
#     return {"id": te.id, "employee_id": te.employee_id, "clock_in_at": te.clock_in_at, "status": te.status}

# from datetime import datetime
# from sqlalchemy import and_
# from sqlalchemy.orm import Session
# # ... imports อื่นคงเดิม ...

# @timeclock_router.post("/{time_entry_id}/stop")
# def stop_time_entry(
#     time_entry_id: int,
#     payload: StopPayload,
#     db: Session = Depends(get_db),
#     user: User = Depends(get_current_user),
# ):
#     te = db.get(TimeEntry, time_entry_id)
#     if not te:
#         raise HTTPException(404, "TimeEntry not found")
#     if te.employee_id != user.employee_id:
#         raise HTTPException(403, "Not your time entry")
#     if te.status != "open":
#         raise HTTPException(400, "TimeEntry already closed or cancelled")

#     now = datetime.utcnow()

#     # ✅ ปิด break ที่ยังเปิดอยู่ทั้งหมดของ time entry นี้
#     open_breaks = (
#         db.query(BreakEntry)
#           .filter(and_(BreakEntry.time_entry_id == te.id, BreakEntry.end_at.is_(None)))
#           .all()
#     )
#     for br in open_breaks:
#         br.end_at = now

#     # ✅ ปิด time entry ด้วย timestamp เดียวกัน
#     te.clock_out_at = now
#     te.clock_out_method = payload.method or "web"
#     te.clock_out_location = payload.location
#     if payload.notes:
#         te.notes = (te.notes or "") + f"\n[OUT] {payload.notes}"
#     te.status = "closed"

#     db.commit()
#     db.refresh(te)
#     return {
#         "id": te.id,
#         "employee_id": te.employee_id,
#         "clock_out_at": te.clock_out_at,
#         "status": te.status,
#         "auto_closed_breaks": [b.id for b in open_breaks],
#     }

# app.include_router(timeclock_router)


# # =====================================================================
# # Breaks API (child of time entry)
# # =====================================================================
# breaks_router = APIRouter(prefix="/breaks", tags=["time_clock"])

# class StartBreakPayload(BaseModel):
#     time_entry_id: int
#     break_type: str = "lunch"
#     method: str | None = "web"
#     location: str | None = None
#     is_paid: bool = False
#     notes: str | None = None

# @breaks_router.post("/start")
# def start_break(
#     payload: StartBreakPayload,
#     db: Session = Depends(get_db),
#     user: User = Depends(get_current_user),
# ):
#     te = db.get(TimeEntry, payload.time_entry_id)
#     if not te:
#         raise HTTPException(404, "TimeEntry not found")
#     if te.employee_id != user.employee_id:
#         raise HTTPException(403, "Not your time entry")
#     if te.status != "open":
#         raise HTTPException(400, "TimeEntry is not open")
#     if te.breaks and te.breaks[-1].end_at is None:
#         raise HTTPException(400, "A break is already in progress")

#     br = BreakEntry(
#         time_entry_id=te.id,
#         break_type=payload.break_type or "lunch",
#         start_at=datetime.utcnow(),            # ✅ กันชัวร์
#         end_at=None,
#         method=payload.method,
#         location=payload.location,
#         notes=payload.notes,
#         is_paid=bool(payload.is_paid),
#     )
#     db.add(br)
#     db.commit()
#     db.refresh(br)
#     return {"id": br.id, "time_entry_id": br.time_entry_id, "start_at": br.start_at, "break_type": br.break_type}

# @breaks_router.post("/{break_id}/stop")
# def stop_break(
#     break_id: int,
#     db: Session = Depends(get_db),
#     user: User = Depends(get_current_user),
# ):
#     br = db.get(BreakEntry, break_id)
#     if not br:
#         raise HTTPException(404, "Break not found")

#     te = db.get(TimeEntry, br.time_entry_id)
#     if not te or te.employee_id != user.employee_id:
#         raise HTTPException(403, "Not your time entry")

#     if br.end_at is not None:
#         raise HTTPException(400, "Break already stopped")

#     br.end_at = datetime.utcnow()
#     db.commit()
#     db.refresh(br)
#     return {"id": br.id, "time_entry_id": br.time_entry_id, "end_at": br.end_at}

# app.include_router(breaks_router)
