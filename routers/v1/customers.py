# routers/customers.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import or_
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

# ---------- schema สำหรับ page (offset) ----------
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

# >>> ---------- schema สำหรับ keyset (cursor) ----------
class CustomerCursorPage(BaseModel):
  items: List[CustomerOut]
  next_cursor: int | None = None
  prev_cursor: int | None = None
  has_more: bool

# ---------- list + pagination (offset เดิม) ----------
@router.get("", response_model=CustomerPage)
def list_customers(
    q: Optional[str] = Query(None, description="Search by code or name (ilike)"),
    page: int = Query(1, ge=1),
    per_page: Optional[int] = Query(20, ge=1, le=1000),
    all: bool = Query(False, description="Return all rows (ignore page/per_page)"),
    db: Session = Depends(get_db),
):
    base_q = db.query(Customer)
    if q:
        like = f"%{q}%"
        base_q = base_q.filter((Customer.code.ilike(like)) | (Customer.name.ilike(like)))

    base_q = base_q.order_by(Customer.id.desc())

    if all:
        items = base_q.all()
        total = len(items)
        return {
            "items": items,
            "total": total,
            "page": 1,
            "per_page": total,
            "pages": 1,
        }

    total = base_q.count()
    offset = (page - 1) * (per_page or 20)
    items = base_q.offset(offset).limit(per_page or 20).all()
    pages = (total + (per_page or 20) - 1) // (per_page or 20)

    return {
        "items": items,
        "total": total,
        "page": page,
        "per_page": per_page or 20,
        "pages": max(pages, 1),
    }

# # >>> ---------- list + pagination (keyset/cursor สองทิศ) ----------
# @router.get("/keyset", response_model=CustomerCursorPage)
# def list_customers_keyset(
#   q: Optional[str] = Query(None, description="Search by code or name (ILIKE)"),
#   limit: int = Query(25, ge=1, le=200),
#   cursor: Optional[int] = Query(None, description="Fetch rows with id > cursor (next page)"),
#   before: Optional[int] = Query(None, description="Fetch rows with id < before (previous page)"),
#   db: Session = Depends(get_db),
# ):
#   """
#   Bidirectional keyset pagination:
#     - หน้าแรก: ไม่ส่ง cursor/before (เรียง ASC)
#     - หน้า 'ถัดไป': ส่ง cursor=<id สุดท้ายของหน้าปัจจุบัน>
#     - หน้า 'ก่อนหน้า': ส่ง before=<id แรกของหน้าปัจจุบัน>
#   คืนค่า items ที่เรียง ASC เสมอ
#   """
#   # base query + search
#   qry = db.query(Customer)
#   if q and q.strip():
#     like = f"%{q.strip()}%"
#     qry = qry.filter(or_(Customer.code.ilike(like), Customer.name.ilike(like)))

#   # กำหนดทิศทาง
#   going_prev = before is not None and cursor is None
#   if going_prev:
#     # กดย้อนกลับ: id < before, เรียง DESC แล้วค่อย reverse ก่อนคืน
#     qry = qry.filter(Customer.id < before).order_by(Customer.id.desc())
#   else:
#     # หน้าแรก / ถัดไป: id > cursor, เรียง ASC
#     if cursor is not None:
#       qry = qry.filter(Customer.id > cursor)
#     qry = qry.order_by(Customer.id.asc())

#   rows = qry.limit(limit + 1).all()  # +1 เพื่อตรวจ has_more

#   # ถ้าย้อนกลับ ให้กลับลำดับเป็น ASC ก่อนส่ง
#   if going_prev:
#     rows = list(reversed(rows))

#   page_rows = rows[:limit]
#   has_more = len(rows) > limit

#   # map -> CustomerOut (ใช้ Pydantic schema ที่คุณมีอยู่แล้ว)
#   # ถ้า CustomerOut = BaseModel(from ORM), สามารถ return ORM ได้เลย
#   # ที่นี่ขอเรียกใช้ตรงๆ
#   items: List[CustomerOut] = [CustomerOut.model_validate(r) for r in page_rows]  # Pydantic v2
#   # ถ้าเป็น v1: items = [CustomerOut.from_orm(r) for r in page_rows]

#   next_cursor = page_rows[-1].id if page_rows else None
#   prev_cursor = page_rows[0].id if page_rows else None

#   return {
#     "items": items,
#     "next_cursor": next_cursor,
#     "prev_cursor": prev_cursor,
#     "has_more": has_more,
#   }

# >>> ---------- list + pagination (keyset/cursor — แสดงใหม่ -> เก่า) ----------
@router.get("/keyset", response_model=CustomerCursorPage)
def list_customers_keyset(
  q: Optional[str] = Query(None, description="Search by code or name (ILIKE)"),
  limit: int = Query(25, ge=1, le=200),
  cursor: Optional[int] = Query(None, description="(DESC) Next page (older): fetch id < cursor"),
  before: Optional[int] = Query(None, description="(DESC) Prev page (newer): fetch id > before"),
  db: Session = Depends(get_db),
):
  """
  Keyset (DESC): แสดงจาก id ใหม่ -> เก่า
    - หน้าแรก: ไม่ส่ง cursor/before (ORDER BY id DESC)
    - Next (ไปเก่า): ส่ง cursor=<id สุดท้ายของหน้าปัจจุบัน> และใช้ id < cursor
    - Prev (ไปใหม่): ส่ง before=<id แรกของหน้าปัจจุบัน> และใช้ id > before
  คืนค่า items เป็น DESC เสมอ
  """
  qry = db.query(Customer)
  if q and q.strip():
    like = f"%{q.strip()}%"
    qry = qry.filter(or_(Customer.code.ilike(like), Customer.name.ilike(like)))

  going_prev = before is not None and cursor is None

  if going_prev:
    # ไป "ใหม่" กว่า: id > before, ดึง ASC เพื่อหยิบที่ใหม่กว่า แล้ว reverse เป็น DESC ก่อนส่งออก
    qry = qry.filter(Customer.id > before).order_by(Customer.id.asc())
    rows = qry.limit(limit + 1).all()
    rows = list(reversed(rows))  # กลับเป็น DESC (ใหม่ -> เก่า)
  else:
    # หน้าแรก หรือไป "เก่า" กว่า: id < cursor, ORDER BY DESC
    if cursor is not None:
      qry = qry.filter(Customer.id < cursor)
    qry = qry.order_by(Customer.id.desc())
    rows = qry.limit(limit + 1).all()

  page_rows = rows[:limit]
  has_more = len(rows) > limit

  items: List[CustomerOut] = [CustomerOut.model_validate(r) for r in page_rows]  # Pydantic v2
  # ถ้า v1: items = [CustomerOut.from_orm(r) for r in page_rows]

  # สำหรับ DESC: แถวแรก = ใหม่สุด, แถวสุดท้าย = เก่าสุด ของหน้านี้
  next_cursor = page_rows[-1].id if page_rows else None  # ไป "เก่า" กว่า
  prev_cursor = page_rows[0].id if page_rows else None   # ไป "ใหม่" กว่า

  return {
    "items": items,
    "next_cursor": next_cursor,
    "prev_cursor": prev_cursor,
    "has_more": has_more,
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

@router.patch("/{customer_id}", response_model=CustomerOut)
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
