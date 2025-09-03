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

router = APIRouter(prefix="/customers", tags=["customers"]) # ใช่อ้างอิง prefix /customers ใน __init__.py

@router.get("/next-code")
def get_next_customer_code(prefix: str = "C", width: int = 4, db: Session = Depends(get_db)):
    return {"next_code": next_code(db, Customer, "code", prefix="C", width=4)}

@router.post("", response_model=CustomerOut)
def create_customer(payload: CustomerCreate, db: Session = Depends(get_db)):
    raw = (payload.code or "").strip().upper()      # ถ้า user ใส่มาให้ตัดช่องว่างและแปลงเป็นตัวใหญ่
    autogen = raw in ("", "AUTO", "AUTOGEN")        # ถ้า user ไม่ใส่ code หรือใส่ AUTO/AUTOGEN ให้สร้าง code อัตโนมัติ
    code = next_code(db, Customer, "code", prefix="C", width=4) if autogen else raw # สร้าง code ใหม่ถ้า autogen
    
    if db.query(Customer).filter(Customer.code == code).first(): # ถ้าในระบบมี code นี้อยู่แล้ว ex "C0001"
        raise HTTPException(409, "Customer code already exists")
    
    # ถ้าในระบบไม่มี code นี้ ให้สร้าง customer ใหม่
    c = Customer(
        code=code,
        name=payload.name.strip(),
        contact=payload.contact,
        email=payload.email,
        phone=payload.phone,
        address=payload.address,
    ) # สร้าง object ขึ้นมาเฉยๆ ยังไม่เขียนลง DB

    for _ in range(3): # พยายามสร้าง customer ใหม่ 3 ครั้ง เผื่อชนกัน
        try:
            db.add(c); db.commit(); db.refresh(c) # เขียนลง DB และ refresh ข้อมูลใหม่
            return c # ถ้าเขียนลง DB สำเร็จ ให้ return ข้อมูล customer ใหม่
        except IntegrityError: # ถ้าเขียนลง DB ไม่สำเร็จ (เช่น code ซ้ำ) จะเกิด IntegrityError
            db.rollback() # ยกเลิก transaction ปัจจุบัน
            if autogen: # ถ้าเป็นการสร้าง code อัตโนมัติ ให้สร้าง code ใหม่แล้วลองใหม่
                # next_code(database, model, field, prefix="" ทีต้องการ เช่น C0001, width=4 จำนวนเลขที่ต้องการ)
                c.code = next_code(db, Customer, "code", prefix="C", width=4)
            else:
                raise HTTPException(409, "Customer code already exists")
    raise HTTPException(500, "Failed to generate unique customer code")

@router.get("", response_model=List[CustomerOut])
def list_customers(q: str | None = Query(None), db: Session = Depends(get_db)): # q เป็น optional query string
    query = db.query(Customer) # สร้าง query ขึ้นมา, หัวใจหลักของการดึงข้อมูล
    if q:
        ql = f"%{q}%" # ใส่ % ข้างหน้าและข้างหลังเพื่อใช้กับ ilike
        query = query.filter((Customer.code.ilike(ql)) | (Customer.name.ilike(ql))) # กรองข้อมูลตาม code หรือ name
    return query.order_by(Customer.id.desc()).all() # เรียงข้อมูลจาก id มากไปน้อยและ return เป็น list

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
