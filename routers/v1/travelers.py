# routers/travelers.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import or_
from typing import List, Optional

from database import get_db
from models import ShopTraveler, ProductionLot, Employee
from schemas import ShopTravelerCreate, ShopTravelerUpdate, ShopTravelerOut

router = APIRouter(prefix="/travelers", tags=["travelers"])


@router.post("", response_model=ShopTravelerOut)
def create_traveler(payload: ShopTravelerCreate, db: Session = Depends(get_db)):
    # validate lot
    lot = db.get(ProductionLot, payload.lot_id)
    if not lot:
        raise HTTPException(404, "Lot not found")

    # validate creator (optional)
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


@router.get("", response_model=List[ShopTravelerOut])
def list_travelers(
    q: Optional[str] = Query(None, description="ค้นหา lot_code / lot_no"),
    db: Session = Depends(get_db),
):
    """
    คืนรายการ Traveler ทั้งหมด (ใหม่ -> เก่า)
    - eager load: lot (ป้องกัน N+1)
    - ถ้ามีพารามิเตอร์ q จะค้นหาจาก lot_code / lot_no
    """
    query = db.query(ShopTraveler).options(selectinload(ShopTraveler.lot))

    if q:
        ql = f"%{q}%"
        query = (
            query.join(ShopTraveler.lot)
            .filter(or_(
                ProductionLot.lot_code.ilike(ql),
                ProductionLot.lot_no.ilike(ql),
            ))
        )

    return query.order_by(ShopTraveler.id.desc()).all()


@router.get("/{traveler_id}", response_model=ShopTravelerOut)
def get_traveler(traveler_id: int, db: Session = Depends(get_db)):
    t = (
        db.query(ShopTraveler)
        .options(selectinload(ShopTraveler.lot))
        .filter(ShopTraveler.id == traveler_id)
        .first()
    )
    if not t:
        raise HTTPException(404, "Traveler not found")
    return t


@router.put("/{traveler_id}", response_model=ShopTravelerOut)
def update_traveler(traveler_id: int, payload: ShopTravelerUpdate, db: Session = Depends(get_db)):
    t = db.get(ShopTraveler, traveler_id)
    if not t:
        raise HTTPException(404, "Traveler not found")

    data = payload.dict(exclude_unset=True)

    # validate created_by_id if present
    if "created_by_id" in data and data["created_by_id"] is not None:
        if not db.get(Employee, data["created_by_id"]):
            raise HTTPException(404, "Creator employee not found")

    for k, v in data.items():
        setattr(t, k, v)

    db.commit()
    db.refresh(t)
    return t


@router.delete("/{traveler_id}")
def delete_traveler(traveler_id: int, db: Session = Depends(get_db)):
    t = db.get(ShopTraveler, traveler_id)
    if not t:
        raise HTTPException(404, "Traveler not found")
    if getattr(t, "steps", None) and len(t.steps) > 0:
        raise HTTPException(400, "Traveler has steps; cannot delete")
    db.delete(t)
    db.commit()
    return {"message": "Traveler deleted"}
