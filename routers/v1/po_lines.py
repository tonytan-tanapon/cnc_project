# routers/po_lines.py
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from models import POLine, ProductionLot, ShopTraveler

# พยายามใช้ atomic generator (แนะนำให้มี utils/sequencer.py + ตาราง doc_counters)
try:
    from utils.sequencer import next_code_yearly as atomic_next_code_yearly
except Exception:
    atomic_next_code_yearly = None

router = APIRouter(prefix="/po-lines", tags=["po-lines"])


class LotTravelerCreateIn(BaseModel):
    planned_qty: int | None = None
    lot_due_date: date | None = None


class LotTravelerOut(BaseModel):
    lot_id: int
    lot_no: str
    traveler_id: int
    traveler_no: str


def _fallback_gen_code(prefix: str, db: Session) -> str:
    """Fallback generator ไม่ atomic (ใช้ชั่วคราวถ้ายังไม่มี utils/sequencer)."""
    seq = (
        db.execute(select(func.coalesce(func.max(ProductionLot.id), 0))).scalar_one()
        or 0
    ) + 1
    return f"{prefix}-{date.today():%Y%m}{seq:04d}"


def next_code_yearly(db: Session, prefix: str) -> str:
    """พยายามใช้ atomic generator; ถ้าไม่มีให้ fallback (เสี่ยงชนในโหลดพร้อมกันสูง)"""
    if atomic_next_code_yearly:
        return atomic_next_code_yearly(db, prefix)
    return _fallback_gen_code(prefix, db)


@router.post("/{po_line_id}/lot-traveler", response_model=LotTravelerOut)
def create_lot_and_traveler(
    po_line_id: int,
    payload: LotTravelerCreateIn | None = None,
    db: Session = Depends(get_db),
):
    pl = db.get(POLine, po_line_id)
    if not pl:
        raise HTTPException(status_code=404, detail="PO line not found")

    planned_qty = (
        payload.planned_qty
        if (payload and payload.planned_qty is not None)
        else int(pl.qty_ordered or 0)
    )
    lot_due_date = (
        payload.lot_due_date
        if (payload and payload.lot_due_date is not None)
        else (pl.due_date.date() if pl.due_date else None)
    )

    try:
        lot_no = next_code_yearly(db, "LOT")
        traveler_no = next_code_yearly(db, "TRV")

        lot = ProductionLot(
            lot_no=lot_no,
            part_id=pl.part_id,
            part_revision_id=pl.revision_id,
            po_id=pl.po_id,
            po_line_id=pl.id,
            planned_qty=planned_qty,
            lot_due_date=lot_due_date,
            status="in_process",
        )
        db.add(lot)
        db.flush()  # ได้ lot.id

        trav = ShopTraveler(
            traveler_no=traveler_no,
            lot_id=lot.id,
            status="open",
        )
        db.add(trav)

        db.commit()
        db.refresh(lot)
        db.refresh(trav)

        return LotTravelerOut(
            lot_id=lot.id,
            lot_no=lot.lot_no,
            traveler_id=trav.id,
            traveler_no=trav.traveler_no,
        )

    except IntegrityError as e:
        db.rollback()
        # ถ้า generator ยังไม่ atomic อาจชน duplicate ได้ ให้ client แสดงข้อความและลองใหม่
        raise HTTPException(status_code=409, detail=f"Duplicate detected: {e.orig}")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# ===== ดึงลิงก์ทั้งหมด (หลาย lot/traveler) สำหรับบรรทัดหนึ่ง =====
class LineLinksOut(BaseModel):
    lots: list[dict] = []
    travelers: list[dict] = []


@router.get("/{po_line_id}/links", response_model=LineLinksOut)
def get_line_links(po_line_id: int, db: Session = Depends(get_db)):
    lots = db.execute(
        select(ProductionLot.id, ProductionLot.lot_no)
        .where(ProductionLot.po_line_id == po_line_id)
        .order_by(ProductionLot.created_at.desc())
    ).all()
    lots_out = [{"id": lid, "lot_no": lno} for (lid, lno) in lots]

    travelers = db.execute(
        select(ShopTraveler.id, ShopTraveler.traveler_no)
        .where(
            ShopTraveler.lot_id.in_(
                select(ProductionLot.id).where(ProductionLot.po_line_id == po_line_id)
            )
        )
        .order_by(ShopTraveler.created_at.desc())
    ).all()
    trs_out = [{"id": tid, "traveler_no": tno} for (tid, tno) in travelers]

    return LineLinksOut(lots=lots_out, travelers=trs_out)
