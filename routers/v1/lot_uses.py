# routers/lot_uses.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text, select, func
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List
from decimal import Decimal

from database import get_db
from models import ProductionLot, RawBatch, LotMaterialUse,RawMaterial
from schemas import (
    LotMaterialUseCreate,    # { lot_id, batch_id, qty }
    LotMaterialUseUpdate,    # { qty }
    LotMaterialUseOut,       # for response
)

router = APIRouter(prefix="/lot-uses", tags=["lot_uses"])

# ---------- helpers ----------

def _get_batch_balances(db: Session, batch_id: int) -> tuple[Decimal, Decimal, Decimal]:
    """return (qty_received, qty_used, qty_available) for a batch"""
    # qty_received
    rb = db.execute(
        select(RawBatch.qty_received).where(RawBatch.id == batch_id)
    ).scalar_one_or_none()
    if rb is None:
        raise HTTPException(404, "Batch not found")

    # qty_used = SUM(lmu.qty)
    used = db.execute(
        select(func.coalesce(func.sum(LotMaterialUse.qty), 0))
        .where(LotMaterialUse.batch_id == batch_id)
    ).scalar_one()

    rec = Decimal(rb)
    used = Decimal(used)
    avail = rec - used
    return rec, used, avail

def _assert_capacity_for_delta(db: Session, batch_id: int, qty_delta: Decimal):
    """ensure used + delta between [0, received]"""
    rec, used, avail = _get_batch_balances(db, batch_id)
    total_after = used + qty_delta
    if total_after < 0:
        raise HTTPException(400, f"Return exceeds used: used={used}, delta={qty_delta}")
    if total_after > rec:
        raise HTTPException(400, f"Not enough batch balance: received={rec}, used={used}, try_delta={qty_delta}")

# ---------- CRUD (batch ระบุเอง) ----------

@router.post("", response_model=LotMaterialUseOut)
def create_lot_use(payload: LotMaterialUseCreate, db: Session = Depends(get_db)):
    lot = db.get(ProductionLot, payload.lot_id)
    if not lot:
        raise HTTPException(404, "Lot not found")

    batch = db.get(RawBatch, payload.batch_id)
    if not batch:
        raise HTTPException(404, "Batch not found")

    qty = Decimal(str(payload.qty))
    if qty <= 0:
        raise HTTPException(400, "qty must be > 0")

    # เช็กจาก movement ไม่อัพเดตคอลัมน์สะสมแล้ว
    _assert_capacity_for_delta(db, batch.id, qty)

    use = LotMaterialUse(lot_id=lot.id, batch_id=batch.id, qty=qty)
    db.add(use)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(400, f"Insert failed: {e}")
    db.refresh(use)
    return use


@router.get("", response_model=List[LotMaterialUseOut])
def list_lot_uses(db: Session = Depends(get_db)):
    return db.query(LotMaterialUse).order_by(LotMaterialUse.id.desc()).all()


@router.get("/{use_id:int}", response_model=LotMaterialUseOut)
def get_lot_use(use_id: int, db: Session = Depends(get_db)):
    u = db.get(LotMaterialUse, use_id)
    if not u:
        raise HTTPException(404, "Usage not found")
    return u


@router.put("/{use_id:int}", response_model=LotMaterialUseOut)
def update_lot_use(use_id: int, payload: LotMaterialUseUpdate, db: Session = Depends(get_db)):
    u = db.get(LotMaterialUse, use_id)
    if not u:
        raise HTTPException(404, "Usage not found")

    new_qty = Decimal(str(payload.qty))
    if new_qty <= 0:
        raise HTTPException(400, "qty must be > 0")

    delta = new_qty - Decimal(u.qty)
    if delta != 0:
        _assert_capacity_for_delta(db, u.batch_id, delta)
        u.qty = new_qty

    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(400, f"Update failed: {e}")
    db.refresh(u)
    return u


@router.delete("/{use_id:int}")
def delete_lot_use(use_id: int, db: Session = Depends(get_db)):
    u = db.get(LotMaterialUse, use_id)
    if not u:
        raise HTTPException(404, "Usage not found")

    # การลบ = คืนสต็อก: ตรวจว่าหลังลบ total_used จะไม่ติดลบ
    _assert_capacity_for_delta(db, u.batch_id, -Decimal(u.qty))

    db.delete(u)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(400, f"Delete failed: {e}")
    return {"message": "Usage deleted"}

# ---------- Auto allocate (ไม่ต้องให้ user เลือก batch) ----------
from pydantic import BaseModel, condecimal
class AllocateIn(BaseModel):
    lot_id: int
    # รองรับทั้ง material_id (int) หรือ material_code (str)
    material_id: int | None = None
    material_code: str | None = None
    qty: condecimal(gt=0)  # type: ignore # ใช้ Decimal ที่ > 0

@router.post("/allocate")
def allocate_fifo(payload: AllocateIn, db: Session = Depends(get_db)):
    lot = db.get(ProductionLot, payload.lot_id)
    if not lot:
        raise HTTPException(404, "Lot not found")

    # resolve material_id (คงเดิม)
    material_id: int | None = payload.material_id
    if material_id is None:
        if not payload.material_code:
            raise HTTPException(422, "Provide material_id or material_code")
        mid = db.execute(
            select(RawMaterial.id).where(RawMaterial.code == payload.material_code)
        ).scalar_one_or_none()
        if mid is None:
            raise HTTPException(404, f"Material code not found: {payload.material_code}")
        material_id = int(mid)

    needed = Decimal(str(payload.qty))
    if needed <= 0:
        raise HTTPException(400, "qty must be > 0")

    # (1) ตรวจสต็อกรวมก่อน (กันลูปแล้วค้างกลางทาง)
    total_avail = db.execute(text("""
        WITH used AS (
          SELECT batch_id, COALESCE(SUM(qty),0)::numeric(18,3) AS qty_used
          FROM lot_material_use
          GROUP BY batch_id
        )
        SELECT COALESCE(SUM(rb.qty_received - COALESCE(u.qty_used,0)),0)::numeric(18,3)
        FROM raw_batches rb
        LEFT JOIN used u ON u.batch_id = rb.id
        WHERE rb.material_id = :material_id
    """), {"material_id": material_id}).scalar_one()
    if Decimal(total_avail) < needed:
        shortage = needed - Decimal(total_avail)
        raise HTTPException(409, f"Insufficient stock for material {material_id}, shortage={shortage}")

    allocations: list[dict] = []

    try:
        # (2) ลูปแบบ FIFO + ล็อกแถว และ FLUSH หลัง add ทุกครั้ง
        while needed > 0:
            row = db.execute(text("""
                WITH used AS (
                  SELECT batch_id, COALESCE(SUM(qty),0)::numeric(18,3) AS qty_used
                  FROM lot_material_use
                  GROUP BY batch_id
                )
                SELECT rb.id AS batch_id,
                       (rb.qty_received - COALESCE(u.qty_used,0))::numeric(18,3) AS qty_avail
                FROM raw_batches rb
                LEFT JOIN used u ON u.batch_id = rb.id
                WHERE rb.material_id = :material_id
                  AND (rb.qty_received - COALESCE(u.qty_used,0)) > 0
                ORDER BY rb.received_at NULLS LAST, rb.id
                LIMIT 1
                FOR UPDATE SKIP LOCKED
            """), {"material_id": material_id}).first()

            if not row:
                # ไม่ควรถึงจุดนี้เพราะตรวจรวมไว้แล้ว แต่กันเผื่อ concurency
                raise HTTPException(409, f"Insufficient stock for material {material_id}, shortage={needed}")

            batch_id, qty_avail = int(row[0]), Decimal(row[1])
            take = min(needed, qty_avail)

            db.add(LotMaterialUse(lot_id=payload.lot_id, batch_id=batch_id, qty=take))
            db.flush()  # <-- สำคัญ: ทำให้ SELECT รอบถัดไป และ before_insert ของแถวถัดไป เห็นยอดที่เพิ่งใช้

            allocations.append({"batch_id": batch_id, "qty": str(take)})
            needed -= take

        db.commit()

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"allocate failed: {type(e).__name__}")

    return {
        "lot_id": payload.lot_id,
        "material_id": material_id,
        "requested_qty": str(payload.qty),
        "allocations": allocations
    }
