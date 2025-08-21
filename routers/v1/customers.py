# routers/customers.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List, Optional, Literal
import re

from database import get_db
from models import Customer
from schemas import CustomerCreate, CustomerUpdate, CustomerOut
from utils.code_generator import next_code

router = APIRouter(prefix="/customers", tags=["customers"])

# --- helper เฉพาะ customers ---
def _next_customer_code(db: Session, prefix: str = "C", width: int = 4) -> str:
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

# --- bulk DTO (ถ้ายังไม่ย้ายไป schemas) ---
class CustomerOp(__import__("pydantic").BaseModel):
    op: Literal["I", "U", "D"]
    id: Optional[int] = None
    code: Optional[str] = None
    name: Optional[str] = None
    contact: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None

class CustomerOpResult(__import__("pydantic").BaseModel):
    row: int
    status: Literal["ok", "error"]
    id: Optional[int] = None
    message: Optional[str] = None

# ===== endpoints (ย้ายมาจาก main.py ได้ตรงๆ แค่เปลี่ยน decorator เป็น @router) =====

@router.get("/export", response_model=List[CustomerOut])
def export_customers(q: str | None = Query(None), db: Session = Depends(get_db)):
    query = db.query(Customer)
    if q:
        ql = f"%{q}%"
        query = query.filter((Customer.code.ilike(ql)) | (Customer.name.ilike(ql)))
    return query.order_by(Customer.id.asc()).all()

@router.post("/bulk", response_model=List[CustomerOpResult])
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

@router.post("", response_model=CustomerOut)
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
            db.add(c); db.commit(); db.refresh(c)
            return c
        except IntegrityError:
            db.rollback()
            if autogen:
                c.code = _next_customer_code(db, prefix="C", width=4)
            else:
                raise HTTPException(409, "Customer code already exists")
    raise HTTPException(500, "Failed to generate unique customer code")

@router.get("/next-code")
def get_next_customer_code(prefix: str = "C", width: int = 4, db: Session = Depends(get_db)):
    return {"next_code": _next_customer_code(db, prefix, width)}

@router.get("", response_model=List[CustomerOut])
def list_customers(q: str | None = Query(None), db: Session = Depends(get_db)):
    query = db.query(Customer)
    if q:
        ql = f"%{q}%"
        query = query.filter((Customer.code.ilike(ql)) | (Customer.name.ilike(ql)))
    return query.order_by(Customer.id.desc()).all()

@router.get("/{customer_id}", response_model=CustomerOut)
def get_customer(customer_id: int, db: Session = Depends(get_db)):
    c = db.get(Customer, customer_id)
    if not c:
        raise HTTPException(404, "Customer not found")
    return c

@router.put("/{customer_id}", response_model=CustomerOut)
def update_customer(customer_id: int, payload: CustomerUpdate, db: Session = Depends(get_db)):
    c = db.get(Customer, customer_id)
    if not c:
        raise HTTPException(404, "Customer not found")
    for k, v in payload.dict(exclude_unset=True).items():
        setattr(c, k, v)
    db.commit(); db.refresh(c)
    return c

@router.delete("/{customer_id}")
def delete_customer(customer_id: int, db: Session = Depends(get_db)):
    c = db.get(Customer, customer_id)
    if not c:
        raise HTTPException(404, "Customer not found")
    if c.pos:
        raise HTTPException(400, "Customer has POs; cannot delete")
    db.delete(c); db.commit()
    return {"message": "Customer deleted"}
