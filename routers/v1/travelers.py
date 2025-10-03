# routers/travelers.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import or_
from typing import List, Optional
from datetime import date

from database import get_db
from models import ShopTraveler, ProductionLot, Employee
from pydantic import BaseModel, ConfigDict
from utils.code_generator import next_code_yearly

router = APIRouter(prefix="/travelers", tags=["travelers"])

# ---------- Schemas ----------
class ShopTravelerCreate(BaseModel):
    traveler_no: Optional[str] = None
    lot_id: int
    created_by_id: Optional[int] = None
    status: str = "open"
    notes: Optional[str] = None
    production_due_date: Optional[date] = None

class ShopTravelerUpdate(BaseModel):
    traveler_no: Optional[str] = None
    lot_id: Optional[int] = None      # allow changing lot (ถ้าไม่อยากให้แก้ ลบบรรทัดนี้)
    created_by_id: Optional[int] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    production_due_date: Optional[date] = None

class ShopTravelerRowOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    traveler_no: Optional[str] = None
    lot_id: int
    lot_no: Optional[str] = None
    created_by_id: Optional[int] = None
    status: str
    notes: Optional[str] = None
    production_due_date: Optional[date] = None
    created_at: Optional[str] = None

# ---------- Helpers ----------
def to_row_out(t: ShopTraveler) -> ShopTravelerRowOut:
    return ShopTravelerRowOut(
        id=t.id,
        traveler_no=t.traveler_no,
        lot_id=t.lot_id,
        lot_no=(t.lot.lot_no if t.lot else None),
        created_by_id=t.created_by_id,
        status=t.status,
        notes=t.notes,
        production_due_date=t.production_due_date,
        created_at=t.created_at.isoformat() if t.created_at else None,
    )

# ---------- CREATE ----------
@router.post("", response_model=ShopTravelerRowOut)
def create_traveler(payload: ShopTravelerCreate, db: Session = Depends(get_db)):
    lot = db.get(ProductionLot, payload.lot_id)
    if not lot:
        raise HTTPException(404, "Lot not found")

    raw_code = (payload.traveler_no or "").strip().upper()
    autogen = raw_code in ("", "AUTO", "AUTOGEN")

    traveler_no = next_code_yearly(db, ShopTraveler, "traveler_no", prefix="TR") if autogen else raw_code

    # ✅ ถ้าผู้ใช้กำหนดเอง ต้องเช็คซ้ำซ้อน
    if not autogen:
        dup = db.query(ShopTraveler).filter(ShopTraveler.traveler_no == traveler_no).first()
        if dup:
            raise HTTPException(409, "Duplicate traveler_no")

    t = ShopTraveler(
        traveler_no=traveler_no,
        lot_id=payload.lot_id,
        created_by_id=payload.created_by_id,
        status=payload.status or "open",
        notes=payload.notes,
        production_due_date=payload.production_due_date,
    )
    db.add(t)
    db.commit()
    # eager lot for lot_no on response
    db.refresh(t)
    db.refresh(t, attribute_names=["lot"])
    return to_row_out(t)

# ---------- LIST ----------
@router.get("", response_model=List[ShopTravelerRowOut])
def list_travelers(
    q: Optional[str] = Query(None, description="ค้นหา lot_code / lot_no"),
    db: Session = Depends(get_db),
):
    query = db.query(ShopTraveler).options(selectinload(ShopTraveler.lot))
    if q:
        ql = f"%{q}%"
        # join เฉพาะเวลาค้นหา เพื่อให้ filter ที่ ProductionLot ได้
        query = (
            query.join(ShopTraveler.lot)
            .filter(or_(ProductionLot.lot_no.ilike(ql), ProductionLot.lot_code.ilike(ql)))
        )
    rows = query.order_by(ShopTraveler.id.desc()).all()
    return [to_row_out(t) for t in rows]

# ---------- GET ----------
@router.get("/{traveler_id}", response_model=ShopTravelerRowOut)
def get_traveler(traveler_id: int, db: Session = Depends(get_db)):
    """
    ดึง Traveler เดี่ยว พร้อม eager load lot
    """
    t = (
        db.query(ShopTraveler)
          .options(selectinload(ShopTraveler.lot))
          .filter(ShopTraveler.id == traveler_id)
          .first()
    )
    if not t:
        raise HTTPException(404, "Traveler not found")
    return to_row_out(t)

# ---------- UPDATE ----------
@router.put("/{traveler_id}", response_model=ShopTravelerRowOut)
def update_traveler(traveler_id: int, payload: ShopTravelerUpdate, db: Session = Depends(get_db)):
    t = db.get(ShopTraveler, traveler_id)
    if not t:
        raise HTTPException(404, "Traveler not found")

    data = payload.dict(exclude_unset=True)

    # ✅ traveler_no (แก้ไขได้ + กันซ้ำ)
    if "traveler_no" in data and data["traveler_no"] is not None:
        new_no = data["traveler_no"].strip().upper()
        if new_no in ("", "AUTO", "AUTOGEN"):
            new_no = next_code_yearly(db, ShopTraveler, "traveler_no", prefix="TR")
        else:
            dup = (
                db.query(ShopTraveler)
                .filter(ShopTraveler.traveler_no == new_no, ShopTraveler.id != traveler_id)
                .first()
            )
            if dup:
                raise HTTPException(409, "Duplicate traveler_no")
        t.traveler_no = new_no

    # lot_id
    if "lot_id" in data and data["lot_id"] is not None:
        if not db.get(ProductionLot, data["lot_id"]):
            raise HTTPException(404, "Lot not found")
        t.lot_id = data["lot_id"]

    # created_by_id
    if "created_by_id" in data and data["created_by_id"] is not None:
        if not db.get(Employee, data["created_by_id"]):
            raise HTTPException(404, "Creator employee not found")
        t.created_by_id = data["created_by_id"]

    if "status" in data and data["status"] is not None:
        t.status = data["status"]

    if "notes" in data and data["notes"] is not None:
        t.notes = data["notes"]

    if "production_due_date" in data:
        t.production_due_date = data["production_due_date"]

    db.commit()
    db.refresh(t)
    db.refresh(t, attribute_names=["lot"])
    return to_row_out(t)

# ---------- DELETE ----------
@router.delete("/{traveler_id}")
def delete_traveler(traveler_id: int, db: Session = Depends(get_db)):
    t = db.get(ShopTraveler, traveler_id)
    if not t:
        raise HTTPException(404, "Traveler not found")
    if t.steps and len(t.steps) > 0:
        raise HTTPException(400, "Traveler has steps; cannot delete")
    db.delete(t)
    db.commit()
    return {"message": "Traveler deleted"}
