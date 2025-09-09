# routers/customers.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List, Optional
from pydantic import BaseModel

from database import get_db
from models import Customer
from schemas import CustomerCreate, CustomerUpdate, CustomerOut
from utils.code_generator import next_code

router = APIRouter(prefix="/customers", tags=["customers"])

@router.get("/next-code")
def get_next_customer_code(prefix: str = "C", width: int = 4, db: Session = Depends(get_db)):
  return {"next_code": next_code(db, Customer, "code", prefix="C", width=4)}

# ---------- schema สำหรับ page ----------
class CustomerPage(BaseModel):
  items: List[CustomerOut]
  total: int
  page: int
  per_page: int
  pages: int

# ---------- schema แบบย่อสำหรับ lookup ----------
class CustomerMini(BaseModel):
  id: int
  code: str | None = None
  name: str | None = None
  class Config:
    orm_mode = True  # ถ้าใช้ Pydantic v2: model_config = {"from_attributes": True}

# ---------- list + pagination ----------
@router.get("", response_model=CustomerPage)
def list_customers(
  q: Optional[str] = Query(None, description="Search by code or name (ilike)"),
  page: int = Query(1, ge=1),
  per_page: int = Query(20, ge=1, le=100),
  db: Session = Depends(get_db),
):
  base_q = db.query(Customer)
  if q:
    ql = f"%{q}%"
    base_q = base_q.filter((Customer.code.ilike(ql)) | (Customer.name.ilike(ql)))

  total = base_q.count()
  base_q = base_q.order_by(Customer.id.desc())

  offset = (page - 1) * per_page
  items = base_q.offset(offset).limit(per_page).all()

  pages = (total + per_page - 1) // per_page if per_page else 1

  return {
    "items": items,
    "total": total,
    "page": page,
    "per_page": per_page,
    "pages": max(pages, 1),
  }

# ---------- lookup (ต้องอยู่เหนือ /{customer_id}) ----------
@router.get("/lookup", response_model=List[CustomerMini])
def lookup_customers(ids: str, db: Session = Depends(get_db)):
  """
  รับ IDs แบบคอมมา เช่น ?ids=1,2,3
  คืน id, code, name สำหรับทำ map บนหน้าอื่น ๆ
  """
  try:
    id_list = [int(x) for x in ids.split(",") if x.strip().isdigit()]
  except Exception:
    id_list = []
  if not id_list:
    return []
  rows = db.query(Customer).filter(Customer.id.in_(id_list)).all()
  return rows

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
        c.code = next_code(db, Customer, "code", prefix="C", width=4)
      else:
        raise HTTPException(409, "Customer code already exists")
  raise HTTPException(500, "Failed to generate unique customer code")

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
  if getattr(c, "pos", None):
    raise HTTPException(400, "Customer has POs; cannot delete")
  db.delete(c); db.commit()
  return {"message": "Customer deleted"}
