# routers/employees.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models import Employee
from schemas import EmployeeCreate, EmployeeUpdate, EmployeeOut
from utils.code_generator import next_code_yearly

router = APIRouter(prefix="/employees", tags=["employees"])


@router.post("", response_model=EmployeeOut)
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


@router.get("", response_model=List[EmployeeOut])
def list_employees(db: Session = Depends(get_db)):
    return db.query(Employee).order_by(Employee.id.desc()).all()


@router.get("/{emp_id}", response_model=EmployeeOut)
def get_employee(emp_id: int, db: Session = Depends(get_db)):
    e = db.get(Employee, emp_id)
    if not e:
        raise HTTPException(404, "Employee not found")
    return e


@router.put("/{emp_id}", response_model=EmployeeOut)
def update_employee(emp_id: int, payload: EmployeeUpdate, db: Session = Depends(get_db)):
    e = db.get(Employee, emp_id)
    if not e:
        raise HTTPException(404, "Employee not found")
    for k, v in payload.dict(exclude_unset=True).items():
        setattr(e, k, v)
    db.commit()
    db.refresh(e)
    return e


@router.delete("/{emp_id}")
def delete_employee(emp_id: int, db: Session = Depends(get_db)):
    e = db.get(Employee, emp_id)
    if not e:
        raise HTTPException(404, "Employee not found")
    db.delete(e)
    db.commit()
    return {"message": "Employee deleted"}
