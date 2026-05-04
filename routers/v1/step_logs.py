from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
from sqlalchemy.exc import SQLAlchemyError

from database import get_db
from models import ShopTravelerStepLog
from pydantic import BaseModel
from datetime import date

from decimal import Decimal

router = APIRouter(prefix="/step-logs", tags=["step-logs"])


# =======================
# GET
# =======================
from typing import List

def calculate_step_status(receive, accept, reject, is_first=False):
    print(f"Calculating status with receive={receive}, accept={accept}, reject={reject}, is_first={is_first}")
    total = accept + reject

    # 🔥 Step 1 (no input source)
    if is_first:
        if accept > 0:
            return "passed"   # ✅ FIX
        if total == 0:
            return "pending"
        return "pending"

    # 🔥 normal steps
    if receive == 0 and total == 0:
        return "pending"

    if total > 0 and total < receive:
        return "running"

    if receive > 0 and total == receive:
        return "passed"

    return "pending"

def recalc_step_status(db: Session, step_id: int):
    from models import ShopTravelerStep

    step = db.get(ShopTravelerStep, step_id)
    if not step:
        return

    # 🔥 total from logs
    total_accept = sum(l.qty_accept or 0 for l in step.logs)
    total_reject = sum(l.qty_reject or 0 for l in step.logs)

    # 🔥 RECEIVE FIX
    if step.seq == 1:
        receive = sum(
            (l.qty_accept or 0) + (l.qty_reject or 0)
            for l in (step.logs or [])
        )

    else:
        prev_step = (
            db.query(ShopTravelerStep)
            .filter(
                ShopTravelerStep.traveler_id == step.traveler_id,
                ShopTravelerStep.seq < step.seq
            )
            .order_by(ShopTravelerStep.seq.desc())
            .first()
        )

        if prev_step:
            receive = sum((l.qty_accept or 0) + (l.qty_reject or 0) for l in prev_step.logs)
        else:
            receive = 0

    # 🔥 STEP 1 SPECIAL LOGIC
    is_first = (step.seq == 1)

    step.status = calculate_step_status(
        receive,
        total_accept,
        total_reject,
        is_first
    )

    print(f"Recalculated step {step.id} status: {step.status} (receive={receive}, accept={total_accept}, reject={total_reject})")

    db.commit()
    db.refresh(step)

class StepLogOut(BaseModel):
    id: int
    step_id: int
    qty_accept: Decimal
    qty_reject: Decimal
    work_date: date

    operator_id: Optional[int] = None
    machine_id: Optional[int] = None

    operator_name: Optional[str] = None
    machine_name: Optional[str] = None


    class Config:
        from_attributes = True

@router.get("", response_model=List[StepLogOut])
def get_step_logs(
    step_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    q = db.query(ShopTravelerStepLog)

    if step_id:
        q = q.filter(ShopTravelerStepLog.step_id == step_id)

    logs = q.order_by(ShopTravelerStepLog.work_date.desc()).all()

    # 🔥 ADD THIS BLOCK (CRITICAL)
    for log in logs:
        log.operator_name = log.operator.name if log.operator else None
        log.machine_name = log.machine.code if log.machine else None

    return logs

# =======================
# CREATE (NO UPSERT)
# =======================
@router.post("")
def create_step_log(payload: dict, db: Session = Depends(get_db)):
    try:
        print("CREATE PAYLOAD:", payload)

        # =========================
        # STEP
        # =========================
        step_id = payload.get("step_id")
        if not step_id:
            raise HTTPException(400, "step_id is required")

        from models import ShopTravelerStep

        step = db.get(ShopTravelerStep, step_id)
        if not step:
            raise HTTPException(404, "Step not found")

        # =========================
        # DATE
        # =========================
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

        # =========================
        # 🔥 INCOMING FIRST (IMPORTANT)
        # =========================
        incoming_accept = Decimal(str(payload.get("qty_accept") or 0))
        incoming_reject = Decimal(str(payload.get("qty_reject") or 0))

        if incoming_accept < 0 or incoming_reject < 0:
            raise HTTPException(400, "qty_accept / qty_reject must be >= 0")

        # =========================
        # 🔥 CALCULATE RECEIVE
        # =========================
        if step.seq == 1:
            receive = None   # Step 1 → no limit
        else:
            prev_step = db.query(ShopTravelerStep)\
                .filter(
                    ShopTravelerStep.traveler_id == step.traveler_id,
                    ShopTravelerStep.seq < step.seq
                )\
                .order_by(ShopTravelerStep.seq.desc())\
                .first()

            receive = sum(
                (Decimal(l.qty_accept or 0) + Decimal(l.qty_reject or 0))
                for l in (prev_step.logs or [])
            ) if prev_step else Decimal("0")

        # =========================
        # 🔥 VALIDATION (ROW LEVEL)
        # =========================
        is_first = step.seq == min(s.seq for s in step.traveler.steps)

        if not is_first and (incoming_accept + incoming_reject > receive):
            raise HTTPException(
                400,
                f"Accept + Reject ({incoming_accept + incoming_reject}) > Receive ({receive})"
            )

        # =========================
        # 🔥 TOTAL VALIDATION
        # =========================
        existing_logs = step.logs or []

        total_accept = sum((Decimal(l.qty_accept or 0)) for l in existing_logs)
        total_reject = sum((Decimal(l.qty_reject or 0)) for l in existing_logs)

        total_accept += incoming_accept
        total_reject += incoming_reject

        if not is_first and (total_accept + total_reject > receive):
            raise HTTPException(
                400,
                f"Total Accept + Reject ({total_accept + total_reject}) > Receive ({receive})"
            )

        # =========================
        # UPSERT (BY DATE)
        # =========================
        existing = db.query(ShopTravelerStepLog).filter(
            ShopTravelerStepLog.step_id == step_id,
            ShopTravelerStepLog.work_date == work_date
        ).first()

        if existing:
            print("Updating existing log")

            existing.qty_accept = incoming_accept
            existing.qty_reject = incoming_reject
            existing.operator_id = payload.get("operator_id")
            existing.machine_id = payload.get("machine_id")
            existing.note = payload.get("note")

            db.commit()
            db.refresh(existing)

            # recalc_step_status(db, step_id)
            db.commit()

            return existing

        # =========================
        # CREATE NEW
        # =========================
        log = ShopTravelerStepLog(
            step_id=step_id,
            qty_accept=incoming_accept,
            qty_reject=incoming_reject,
            work_date=work_date,
            operator_id=payload.get("operator_id"),
            machine_id=payload.get("machine_id"),
            note=payload.get("note"),
        )

        db.add(log)
        db.commit()
        db.refresh(log)

        recalc_step_status(db, step_id)
        db.commit()

        return log

    except HTTPException:
        raise

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
        from models import ShopTravelerStep

        log = db.get(ShopTravelerStepLog, log_id)
        if not log:
            raise HTTPException(404, "Log not found")

        step = db.get(ShopTravelerStep, log.step_id)
        if not step:
            raise HTTPException(404, "Step not found")

        # =========================
        # NEW VALUES
        # =========================
        new_accept = Decimal(str(payload["qty_accept"])) if "qty_accept" in payload else log.qty_accept
        new_reject = Decimal(str(payload["qty_reject"])) if "qty_reject" in payload else log.qty_reject
        if new_accept < 0:
            raise HTTPException(400, "qty_accept must be >= 0")

        if new_reject < 0:
            raise HTTPException(400, "qty_reject must be >= 0")

        # =========================
        # 🔥 CALCULATE RECEIVE FIRST (FIX)
        # =========================
        if step.seq == 1:
            receive = sum(
                (l.qty_accept or 0) + (l.qty_reject or 0)
                for l in (step.logs or [])
            )
        else:
            prev_step = db.query(ShopTravelerStep)\
                .filter(
                    ShopTravelerStep.traveler_id == step.traveler_id,
                    ShopTravelerStep.seq < step.seq
                )\
                .order_by(ShopTravelerStep.seq.desc())\
                .first()

            receive = sum(
                (l.qty_accept or 0) + (l.qty_reject or 0)
                for l in prev_step.logs
            ) if prev_step else 0

        # =========================
        # 🔥 CALCULATE TOTAL AFTER CHANGE
        # =========================
        existing_logs = step.logs or []

        
        total_accept = sum((l.qty_accept or Decimal("0")) for l in existing_logs)
        total_reject = sum((l.qty_reject or Decimal("0")) for l in existing_logs)
        # subtract old
        total_accept -= (log.qty_accept or 0)
        total_reject -= (log.qty_reject or 0)

        # add new
        total_accept += new_accept
        total_reject += new_reject

        # =========================
        # 🔥 FINAL VALIDATION (CORRECT)
        # =========================
        is_first = step.seq == min(s.seq for s in step.traveler.steps)
        if not is_first and (total_accept + total_reject > receive):
            raise HTTPException(
                400,
                f"Total Accept + Reject ({total_accept + total_reject}) > Receive ({receive})"
            )

        # =========================
        # APPLY UPDATE
        # =========================
        if "qty_accept" in payload:
            log.qty_accept = payload["qty_accept"]

        if "qty_reject" in payload:
            log.qty_reject = payload["qty_reject"]

        if "note" in payload:
            log.note = payload["note"]

        if "work_date" in payload:
            log.work_date = datetime.fromisoformat(payload["work_date"]).date()

        if "operator_id" in payload:
            log.operator_id = int(payload["operator_id"]) if payload["operator_id"] else None

        if "machine_id" in payload:
            log.machine_id = int(payload["machine_id"]) if payload["machine_id"] else None

       

        db.commit()
        db.refresh(log)

        recalc_step_status(db, log.step_id)
        db.commit()

        return log

    except HTTPException:
        raise

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
        
        step_id = log.step_id   # 🔥 ADD THIS

        db.delete(log)
        db.commit()
        # 🔥 ADD THIS
        recalc_step_status(db, step_id)
        db.commit()
        return {"status": "deleted"}

    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(500, str(e))