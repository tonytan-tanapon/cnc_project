from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
from sqlalchemy.exc import SQLAlchemyError

from database import get_db
from models import ShopTravelerStepLog

router = APIRouter(prefix="/step-logs", tags=["step-logs"])


# =======================
# GET
# =======================
@router.get("")
def get_step_logs(
    step_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    q = db.query(ShopTravelerStepLog)

    if step_id:
        q = q.filter(ShopTravelerStepLog.step_id == step_id)

    return q.order_by(ShopTravelerStepLog.work_date.desc()).all()


# =======================
# CREATE (NO UPSERT)
# =======================
@router.post("")
def create_step_log(payload: dict, db: Session = Depends(get_db)):
    
    try:
        print("CREATE PAYLOAD:", payload)

        step_id = payload.get("step_id")
        if not step_id:
            raise HTTPException(400, "step_id is required")

        from datetime import datetime
        import pytz

        work_date_str = payload.get("work_date")

        if work_date_str:
            try:
                work_date = datetime.fromisoformat(work_date_str).date()
            except ValueError:
                raise HTTPException(400, "Invalid work_date format")
        else:
            la = pytz.timezone("America/Los_Angeles")
            work_date = datetime.now(la).date()


        # 🔥 CHECK EXISTING
        existing = db.query(ShopTravelerStepLog).filter(
            ShopTravelerStepLog.step_id == step_id,
            ShopTravelerStepLog.work_date == work_date
        ).first()

        if existing:
            # 👉 UPDATE INSTEAD OF INSERT
            print("Existing log found for step_id", step_id, "on", work_date, "- updating instead of creating new.")
            if "qty_accept" in payload:
                existing.qty_accept = float(payload["qty_accept"])
            if "qty_reject" in payload:
                existing.qty_reject = float(payload["qty_reject"])

            db.commit()
            db.refresh(existing)
            return existing

        # 👉 CREATE NEW
        log = ShopTravelerStepLog(
            step_id=step_id,
            qty_accept=float(payload.get("qty_accept") or 0),
            qty_reject=float(payload.get("qty_reject") or 0),
            work_date=work_date
        )

        db.add(log)
        db.commit()
        db.refresh(log)

        return log

    except Exception as e:
        db.rollback()
        print("ERROR:", str(e))
        raise HTTPException(500, str(e))


# =======================
# UPDATE (PARTIAL ONLY)
# =======================
@router.patch("/{log_id}")
def update_log(log_id: int, payload: dict, db: Session = Depends(get_db)):
    print("UPDATE PAYLOAD:", payload)
    try:
        log = db.get(ShopTravelerStepLog, log_id)
        print("Existing log:", log)
        if not log:
            raise HTTPException(404, "Log not found")

        print("Payload:", payload)

        # qty_accept
        if "qty_accept" in payload:
            val = float(payload["qty_accept"])
            if val < 0:
                raise HTTPException(400, "qty_accept must be >= 0")
            log.qty_accept = val

        # qty_reject
        if "qty_reject" in payload:
            val = float(payload["qty_reject"])
            if val < 0:
                raise HTTPException(400, "qty_reject must be >= 0")
            log.qty_reject = val

        # 🔥 ADD THIS
        if "work_date" in payload:
            try:
                log.work_date = datetime.fromisoformat(payload["work_date"]).date()
            except:
                raise HTTPException(400, "Invalid work_date")

        db.commit()
        db.refresh(log)

        return log

    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(500, str(e))


# =======================
# DELETE
# =======================
@router.delete("/{log_id}")
def delete_log(log_id: int, db: Session = Depends(get_db)):

    try:
        log = db.get(ShopTravelerStepLog, log_id)
        if not log:
            raise HTTPException(404, "Log not found")

        db.delete(log)
        db.commit()

        return {"status": "deleted"}

    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(500, str(e))