# routers/employees.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from sqlalchemy import or_
from database import get_db
from models import Employee
from schemas import EmployeeCreate, EmployeeUpdate, EmployeeOut
from utils.code_generator import next_code_yearly
from pydantic import BaseModel

router = APIRouter(prefix="/employees", tags=["employees"])


@router.post("", response_model=EmployeeOut)
def create_employee(payload: EmployeeCreate, db: Session = Depends(get_db)):
    
    print(payload)
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
        payroll_emp_id=payload.payroll_emp_id,  # ← ถ้ามีส่งมา ก็ใช้ค่านี้ก่อน
    )

    db.add(emp)
    db.commit()
    db.refresh(emp)


    # ✅ ถ้ายังไม่มี payroll_emp_id → ตั้งให้เท่ากับ id ตัวเอง
    if emp.payroll_emp_id is None:
        emp.payroll_emp_id = emp.id
        db.commit()
        db.refresh(emp)

    return emp
    

# >>> ---------- schema สำหรับ keyset (cursor) ----------
class EmployeeCursorPage(BaseModel):
  items: List[EmployeeOut]
  next_cursor: int | None = None
  prev_cursor: int | None = None
  has_more: bool

@router.get("/keyset", response_model=EmployeeCursorPage)
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
  qry = db.query(Employee)
  if q and q.strip():
    like = f"%{q.strip()}%"
    qry = qry.filter(or_(Employee.emp_code.ilike(like), Employee.name.ilike(like)))

  going_prev = before is not None and cursor is None

  if going_prev:
    # ไป "ใหม่" กว่า: id > before, ดึง ASC เพื่อหยิบที่ใหม่กว่า แล้ว reverse เป็น DESC ก่อนส่งออก
    qry = qry.filter(Employee.id > before).order_by(Employee.id.asc())
    rows = qry.limit(limit + 1).all()
    rows = list(reversed(rows))  # กลับเป็น DESC (ใหม่ -> เก่า)
  else:
    # หน้าแรก หรือไป "เก่า" กว่า: id < cursor, ORDER BY DESC
    if cursor is not None:
      qry = qry.filter(Employee.id < cursor)
    qry = qry.order_by(Employee.id.desc())
    rows = qry.limit(limit + 1).all()

  page_rows = rows[:limit]
  has_more = len(rows) > limit

  items: List[EmployeeOut] = [EmployeeOut.model_validate(r) for r in page_rows]  # Pydantic v2
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


@router.get("", response_model=List[EmployeeOut])
def list_employees(
    status: Optional[List[str]] = Query(None, description="Filter by one or more statuses, e.g. ?status=active&status=on_leave"),
    q: Optional[str] = Query(None, description="Search by name or code"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(Employee)

    # filter by 1+ statuses
    if status:
        # normalize to lowercase if you store lowercase
        statuses = [s.lower() for s in status]
        query = query.filter(Employee.status.in_(statuses))

    # optional search
    if q:
        ql = f"%{q}%"
        # adjust field names to your model (emp_code/name)
        query = query.filter((Employee.emp_code.ilike(ql)) | (Employee.name.ilike(ql)))



    return (
        query.order_by(Employee.name.asc())
             .offset(offset)
             .limit(limit)
             .all()
    )

from sqlalchemy.orm import joinedload

@router.get("/{emp_id}", response_model=EmployeeOut)
def get_employee(emp_id: int, db: Session = Depends(get_db)):
    e = (
        db.query(Employee)
        .options(
            joinedload(Employee.payroll_emp),
            joinedload(Employee.payroll_dependents)
        )
        .get(emp_id)
    )
    if not e:
        raise HTTPException(404, "Employee not found")
    return e

@router.get("/by-code/{emp_code}", response_model=EmployeeOut)
def get_employee_by_code(emp_code: str, db: Session = Depends(get_db)):
    e = (
        db.query(Employee)
        .options(
            joinedload(Employee.payroll_emp),
            joinedload(Employee.payroll_dependents)
        )
        .filter(Employee.emp_code == emp_code)
        .first()
    )

    if not e:
        raise HTTPException(status_code=404, detail="Employee not found")

    return e
@router.patch("/{emp_id}", response_model=EmployeeOut)
def update_employee(emp_id: int, payload: EmployeeUpdate, db: Session = Depends(get_db)):
    print(payload.dict())
    e = db.get(Employee, emp_id)
    print("id", e)
    if not e:
        raise HTTPException(404, "Employee not found")
    for k, v in payload.dict(exclude_unset=True).items():
        print(e,k,v)
        setattr(e, k, v)
    print("commit")
    db.commit()
    db.refresh(e)
    return e


# @router.delete("/{emp_id}")
# def delete_employee(emp_id: int, db: Session = Depends(get_db)):
#     e = db.get(Employee, emp_id)
#     if not e:
#         raise HTTPException(404, "Employee not found")
#     db.delete(e)
#     db.commit()
#     return {"message": "Employee deleted"}

@router.delete("/{emp_id}")
def delete_employee(emp_id: int, db: Session = Depends(get_db)):
    e = db.get(Employee, emp_id)
    if not e:
        raise HTTPException(404, "Employee not found")

    # ✅ ล้าง payroll_emp_id ของทุกคนที่อ้างถึงพนักงานนี้ก่อน
    db.query(Employee).filter(Employee.payroll_emp_id == emp_id).update(
        {Employee.payroll_emp_id: None},
        synchronize_session=False
    )

    # ✅ เคลียร์ reference ใน session ป้องกัน circular dependency
    db.flush()
    db.expire_all()

    # ✅ จากนั้นค่อยลบพนักงานนี้
    db.delete(e)
    db.commit()

    return {"message": f"Employee {e.name} deleted successfully"}