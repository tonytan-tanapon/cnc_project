from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from database import get_db
from models import ShopTravelerStepLog

router = APIRouter(prefix="/step-logs", tags=["step-logs"])


@router.get("")
def get_step_logs(
    step_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    q = db.query(ShopTravelerStepLog)

    if step_id:
        q = q.filter(ShopTravelerStepLog.step_id == step_id)

    logs = q.order_by(ShopTravelerStepLog.work_date.desc()).all()

    return logs


from datetime import datetime
from sqlalchemy.exc import IntegrityError

@router.post("")
def create_step_log(payload: dict, db: Session = Depends(get_db)):

    step_id = payload.get("step_id")
    work_date = payload.get("work_date") or datetime.utcnow().date()

    if not step_id:
        raise HTTPException(400, "step_id is required")

    # 🔥 check existing log for same day
    existing = db.query(ShopTravelerStepLog).filter(
        ShopTravelerStepLog.step_id == step_id,
        ShopTravelerStepLog.work_date == work_date
    ).first()

    if existing:
        # ✅ UPDATE instead of insert
        existing.qty_receive = float(payload.get("qty_receive") or 0)
        existing.qty_accept  = float(payload.get("qty_accept") or 0)
        existing.qty_reject  = float(payload.get("qty_reject") or 0)

        db.commit()
        return {"status": "updated"}

    # ✅ CREATE NEW
    log = ShopTravelerStepLog(
        step_id=step_id,
        qty_receive=float(payload.get("qty_receive") or 0),
        qty_accept=float(payload.get("qty_accept") or 0),
        qty_reject=float(payload.get("qty_reject") or 0),
        work_date=work_date
    )

    db.add(log)
    db.commit()

    return {"status": "created"}