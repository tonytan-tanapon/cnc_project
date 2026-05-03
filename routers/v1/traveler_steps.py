# routers/traveler_steps.py
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from decimal import Decimal
from database import get_db
from models import ShopTravelerStep, ShopTraveler, Employee
from schemas import (
    ShopTravelerStepCreate, ShopTravelerStepUpdate, ShopTravelerStepOut
)
from models import ShopTravelerStepLog
                  
router = APIRouter(prefix="/traveler-steps", tags=["traveler_steps"])


@router.post("", response_model=ShopTravelerStepOut)
def create_traveler_step(payload: ShopTravelerStepCreate, db: Session = Depends(get_db)):
    # ต้องมี traveler
    t = db.get(ShopTraveler, payload.traveler_id)
    if not t:
        raise HTTPException(404, "Traveler not found")

    # operator (ถ้าระบุ) ต้องมีจริง
    if payload.operator_id and not db.get(Employee, payload.operator_id):
        raise HTTPException(404, "Operator not found")

    # กัน seq ซ้ำภายใน traveler เดียวกัน
    dup = (
        db.query(ShopTravelerStep)
        .filter(
            ShopTravelerStep.traveler_id == payload.traveler_id,
            ShopTravelerStep.seq == payload.seq,
        )
        .first()
    )
    if dup:
        raise HTTPException(409, "This seq already exists in traveler")
   
    s = ShopTravelerStep(
        traveler_id=payload.traveler_id,
        seq=payload.seq,
        step_name=payload.step_name,
        step_code=payload.step_code,
        # station=payload.station,
        # operator_id=payload.operator_id,
        qa_required=payload.qa_required or False,
        status="pending" if not payload.status else payload.status,
        step_note=payload.step_note,
        step_detail=payload.step_detail or "",
        # machaine_id=payload.machine_id,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s

@router.get("", response_model=List[dict])
def list_traveler_steps(traveler_id: Optional[int] = None, db: Session = Depends(get_db)):

    try:
        from sqlalchemy.orm import joinedload

        q = (
            db.query(ShopTravelerStep, Employee)
            .options(joinedload(ShopTravelerStep.logs))
            .outerjoin(Employee, ShopTravelerStep.operator_id == Employee.id)
        )

        if traveler_id:
            q = q.filter(ShopTravelerStep.traveler_id == traveler_id)

        rows = q.order_by(ShopTravelerStep.seq.asc()).all()

        result = []

        prev_accept = None

        for i, (step, emp) in enumerate(rows):
          

            logs = step.logs or []

            total_accept = sum((l.qty_accept or 0) for l in logs)
            total_reject = sum((l.qty_reject or 0) for l in logs)

            # 🔥 NEW LOGIC
            if i == 0:
                receive = total_accept + total_reject
            else:
                receive = prev_accept or 0


            is_first = (i == 0)

            status = calculate_step_status(
                receive,
                total_accept,
                total_reject,
                is_first
            )
            print(f"Step {step.id} - receive: {receive}, accept: {total_accept}, reject: {total_reject} => status: {status}")
            result.append({
                "id": step.id,
                "traveler_id": step.traveler_id,
                "seq": step.seq,
                "step_name": step.step_name,
                "step_detail": step.step_detail,
                "step_code": step.step_code,
                "station": step.station,
                "status": status,
                "operator_id": step.operator_id,
                "machine_id": step.machine_id,
                "machine_code": step.machine.code if step.machine else None,
                "machine_name": step.machine.code if step.machine else None,
                "operator_name": emp.name if emp else None,
                

                "operator_nickname": (
                    f"{emp.emp_code} - {emp.nickname}" if emp else None
                ),

                # ✅ FIXED VALUES
                "total_receive": receive,
                "total_accept": total_accept,
                "total_reject": total_reject,

                "supplier_po": step.supplier_po,
                "supplier_name": step.supplier_name,
                "heat_lot": step.heat_lot,

                "logs": [
                    {
                        "id": l.id,
                        "work_date": l.work_date,
                        "qty_receive": float(l.qty_receive or 0),
                        "qty_accept": float(l.qty_accept or 0),
                        "qty_reject": float(l.qty_reject or 0),
                        "machine_id": l.machine_id,
                        "operator_id": l.operator_id,
                        "machine_name": l.machine.code if l.machine else None,
                        "operator_name": l.operator.name if l.operator else None,
                        "operator_nickname": l.operator.nickname if l.operator else None,
                        "note": l.note,
                    }
                    for l in logs
                ],
            })

            # 🔥 carry forward to next step
            prev_accept = total_accept

        return result

    except Exception as e:
        print("🔥 ERROR in list_traveler_steps:", str(e))
        return []   # 🔥 NEVER return None

@router.get("/{step_id}", response_model=ShopTravelerStepOut)
def get_traveler_step(step_id: int, db: Session = Depends(get_db)):
    s = db.get(ShopTravelerStep, step_id)
    if not s:
        raise HTTPException(404, "Step not found")
    return s


from fastapi import HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

@router.put("/{step_id}", response_model=ShopTravelerStepOut)
def update_traveler_step(
    step_id: int,
    payload: ShopTravelerStepUpdate,
    db: Session = Depends(get_db)
):
    
    print("Update payload:", payload.dict())
    # -----------------------------
    # 1. Load step
    # -----------------------------
    s = db.get(ShopTravelerStep, step_id)
    if not s:
        raise HTTPException(404, "Step not found")

    data = payload.dict(exclude_unset=True)

    # -----------------------------
    # 2. Validate seq (no duplicate)
    # -----------------------------
    if "seq" in data and data["seq"] is not None and data["seq"] != s.seq:
        dup = (
            db.query(ShopTravelerStep)
            .filter(
                ShopTravelerStep.traveler_id == s.traveler_id,
                ShopTravelerStep.seq == data["seq"],
            )
            .first()
        )
        if dup:
            raise HTTPException(409, "This seq already exists in traveler")

    # -----------------------------
    # 3. Validate operator_id (if sent)
    # -----------------------------
    if "operator_id" in data and data["operator_id"] is not None:
        if not db.get(Employee, data["operator_id"]):
            raise HTTPException(404, "Operator not found")

    # -----------------------------
    # 4. 🔥 HANDLE operator_nickname
    # -----------------------------
    if "operator_nickname" in data:
        nickname = data["operator_nickname"]

        if nickname is None or nickname.strip() == "":
            # clear operator
            s.operator_id = None
        else:
            nickname = nickname.strip()

            emps = (
                db.query(Employee)
                .filter(func.lower(Employee.nickname) == nickname.lower())
                .all()
            )

            if not emps:
                raise HTTPException(400, f"Nickname '{nickname}' not found")

            if len(emps) > 1:
                raise HTTPException(
                    400,
                    f"Duplicate nickname '{nickname}', please use emp_code"
                )

            s.operator_id = emps[0].id

        # ❗ prevent overwrite in loop
        del data["operator_nickname"]

    # -----------------------------
    # 5. Apply remaining fields
    # -----------------------------
    for k, v in data.items():
        setattr(s, k, v)

    # -----------------------------
    # 6. Save
    # -----------------------------
    db.commit()
    db.refresh(s)

    return s


@router.delete("/{step_id}")
def delete_traveler_step(step_id: int, db: Session = Depends(get_db)):
    s = db.get(ShopTravelerStep, step_id)
    if not s:
        raise HTTPException(404, "Step not found")
    db.delete(s)
    db.commit()
    return {"message": "Step deleted"}


# ----- Step actions -----

@router.post("/{step_id}/start", response_model=ShopTravelerStepOut)
def start_step(step_id: int, db: Session = Depends(get_db)):
    s = db.get(ShopTravelerStep, step_id)
    if not s:
        raise HTTPException(404, "Step not found")
    s.status = "running"
    s.started_at = datetime.utcnow()
    db.commit()
    db.refresh(s)
    return s




from schemas import StepFinishRequest


@router.post("/{step_id}/finish", response_model=ShopTravelerStepOut)
def finish_step(
    step_id: int,
    payload: StepFinishRequest,
    db: Session = Depends(get_db),
):
    from models import (
        ShopTraveler,
        ProductionLot,
        CustomerShipment,
        CustomerShipmentItem,
    )
    from sqlalchemy import func

    # =========================
    # GET STEP
    # =========================
    s = db.get(ShopTravelerStep, step_id)
    if not s:
        raise HTTPException(404, "Step not found")

    result = payload.result or "passed"

    if result not in ["passed", "failed", "skipped"]:
        raise HTTPException(400, "Invalid result")

    # =========================
    # UPDATE QTY
    # =========================
  

    if payload.qty_accept is not None or payload.qty_reject is not None:

        accept = float(payload.qty_accept or 0)
        reject = float(payload.qty_reject or 0)

        log = ShopTravelerStepLog(
            step_id=s.id,
            qty_receive=accept + reject,
            qty_accept=accept,
            qty_reject=reject,
            work_date=datetime.utcnow().date()
        )

        db.add(log)


    # =========================
    # AUTO START
    # =========================
    if s.status == "pending":
        s.started_at = datetime.utcnow()

    # =========================
    # FINISH STEP
    # =========================
    s.status = result
    s.finished_at = datetime.utcnow()

    if payload.qa_result is not None:
        s.qa_result = payload.qa_result

    if payload.qa_notes is not None:
        s.qa_notes = payload.qa_notes

    # =========================
    # 🔥 AUTO ALLOCATE (CLEAN VERSION)
    # =========================
    if result == "passed" and payload.qty_accept is not None:

        traveler = db.get(ShopTraveler, s.traveler_id)
        lot = db.get(ProductionLot, traveler.lot_id)

        new_qty = float(payload.qty_accept or 0)

        if new_qty < 0:
            raise HTTPException(400, "qty_accept cannot be negative")

        # -------------------------
        # GET SHIPMENT
        # -------------------------
        shipment = (
            db.query(CustomerShipment)
            .filter(CustomerShipment.lot_id == lot.id)
            .order_by(CustomerShipment.id.desc())
            .first()
        )

        # -------------------------
        # FIND EXISTING ITEM
        # -------------------------
        item = None
        if shipment:
            item = (
                db.query(CustomerShipmentItem)
                .filter(CustomerShipmentItem.shipment_id == shipment.id)
                .filter(CustomerShipmentItem.lot_allocate_id == lot.id)
                .first()
            )

        # 🔥 IMPORTANT
        old_qty = float(item.qty) if item else 0

        # =========================
        # 🧠 ZERO CASE (CLEAR ALL)
        # =========================
        if new_qty == 0:
            db.query(ShopTravelerStepLog).filter(
                ShopTravelerStepLog.step_id == s.id
            ).delete()

            if item:
                db.delete(item)

            db.commit()
            db.refresh(s)
            return s

        # =========================
        # 🧠 CALCULATE AVAILABLE
        # =========================
        # 🔥 ใช้ step นี้เลย (สำคัญมาก)
        finished_qty = sum((l.qty_accept or 0) for l in s.logs)

        shipped_qty = (
            db.query(func.coalesce(func.sum(CustomerShipmentItem.qty), 0))
            .filter(CustomerShipmentItem.lot_allocate_id == lot.id)
            .scalar()
            or 0
        )

        # 🔥 FIX สำคัญ
        available_qty = float(finished_qty) - float(shipped_qty) + old_qty

        if new_qty > available_qty:
            raise HTTPException(
                400,
                detail=f"Not enough available qty ({available_qty})"
            )

        # =========================
        # CREATE SHIPMENT
        # =========================
        if not shipment:
            shipment = CustomerShipment(
                po_id=lot.po_id,
                lot_id=lot.id,
                shipped_at=datetime.utcnow(),
                status="pending",
            )
            db.add(shipment)
            db.flush()

        # =========================
        # DELETE OLD
        # =========================
        if item:
            db.delete(item)
            db.flush()

        # =========================
        # INSERT NEW
        # =========================
        new_item = CustomerShipmentItem(
            shipment_id=shipment.id,
            po_line_id=lot.po_line_id or 0,
            lot_id=lot.id,
            lot_allocate_id=lot.id,
            qty=new_qty,
        )
        db.add(new_item)

    # =========================
    # COMMIT
    # =========================
    db.commit()
    db.refresh(s)

    return s

from models import ShopTraveler as TravelerStep  # ถ้ามี
from schemas import ShopTravelerOut as TravelerStepOut # ถ้ามี
# routers/traveler_steps.py (ไฟล์เดียวกับ start/finish)

@router.post("/{step_id}/restart", response_model=ShopTravelerStepOut)
def restart_step(step_id: int, db: Session = Depends(get_db)):
    s = db.get(ShopTravelerStep, step_id)  # ← ใช้ Step model
    if not s:
        raise HTTPException(404, "Step not found")

    # รีเซ็ตฟิลด์ของ "Step" ให้ตรง schema/model คุณ
    s.status = "pending"          # กลับมาเริ่มใหม่

    s.qa_result = None
    s.qa_notes = None
    s.operator_id = None          # จะเก็บคนเดิมไว้ก็ได้ (ถ้าอยาก)
    s.started_at = None
    s.finished_at = None

    db.commit()
    db.refresh(s)
    return s


from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
@router.post("/import")
async def import_steps(
    traveler_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):

    print("import")
    try:
        content = await file.read()
        print(content)
    #     filename = file.filename.lower()

    #     import csv, io, json

    #     if filename.endswith(".json"):
    #         rows = json.loads(content.decode("utf-8"))

    #     elif filename.endswith(".csv"):
    #         text = content.decode("utf-8")
    #         reader = csv.DictReader(io.StringIO(text))
    #         rows = list(reader)

    #     else:
    #         raise HTTPException(400, "Unsupported file format")

    #     steps = []

    #     for i, r in enumerate(rows):
    #         step = ShopTravelerStep(
    #             traveler_id=traveler_id,
    #             seq=(i + 1) * 10,
    #             step_name=r.get("step_name") or r.get("Step"),
    #             step_detail=r.get("step_detail"),
    #             step_code=r.get("step_code"),
    #             qty_receive=int(r.get("qty_receive") or 0),
    #             qty_accept=int(r.get("qty_accept") or 0),
    #             qty_reject=int(r.get("qty_reject") or 0),
    #             status="pending",
    #             station=r.get("station"),
    #             step_note=r.get("step_note"),
    #         )

    #         db.add(step)
    #         steps.append(step)

    #     db.commit()

    #     return {"inserted": len(steps)}

    except Exception as e:
        raise HTTPException(500, str(e))
 

@router.post("/shipment/update-from-ui")
def update_shipment_from_ui(payload: dict, db: Session = Depends(get_db)):
    from models import (
        ShopTravelerStep,
        ShopTravelerStepLog,
        ShopTraveler,
        ProductionLot,
        CustomerShipment,
        CustomerShipmentItem
    )
    from sqlalchemy import func

    lot_id = payload.get("lot_id")
    qty = float(payload.get("qty") or 0)

    if qty < 0:
        raise HTTPException(400, "qty cannot be negative")

    # =========================
    # GET LOT + LAST STEP
    # =========================
    traveler = (
        db.query(ShopTraveler)
        .filter(ShopTraveler.lot_id == lot_id)
        .order_by(ShopTraveler.id.desc())
        .first()
    )

    if not traveler:
        raise HTTPException(404, "Traveler not found")

    last_step = (
        db.query(ShopTravelerStep)
        .filter(ShopTravelerStep.traveler_id == traveler.id)
        .order_by(ShopTravelerStep.seq.desc())
        .first()
    )

    if not last_step:
        raise HTTPException(404, "Last step not found")

    # =========================
    # 🔥 RESET LOGS (IMPORTANT)
    # =========================
    db.query(ShopTravelerStepLog).filter(
        ShopTravelerStepLog.step_id == last_step.id
    ).delete()

    # =========================
    # INSERT NEW LOG
    # =========================
    log = ShopTravelerStepLog(
        step_id=last_step.id,
        qty_receive=qty,
        qty_accept=qty,
        qty_reject=0,
        work_date=datetime.utcnow().date()
    )
    db.add(log)

    # =========================
    # SHIPMENT UPDATE
    # =========================
    lot = db.get(ProductionLot, lot_id)

    shipment = (
        db.query(CustomerShipment)
        .filter(CustomerShipment.lot_id == lot_id)
        .order_by(CustomerShipment.id.desc())
        .first()
    )

    if not shipment:
        shipment = CustomerShipment(
            po_id=lot.po_id,
            lot_id=lot.id,
            shipped_at=datetime.utcnow(),
            status="pending",
        )
        db.add(shipment)
        db.flush()

    # delete old item
    db.query(CustomerShipmentItem).filter(
        CustomerShipmentItem.shipment_id == shipment.id,
        CustomerShipmentItem.lot_allocate_id == lot_id
    ).delete()

    # insert new
    item = CustomerShipmentItem(
        shipment_id=shipment.id,
        po_line_id=lot.po_line_id or 0,
        lot_id=lot.id,
        lot_allocate_id=lot.id,
        qty=qty,
    )
    db.add(item)

    db.commit()

    return {"status": "ok"}


def calculate_step_status(receive, accept, reject, is_first):
    total = accept + reject

    # Step 1 (no planned_qty)
    if is_first:
        if total == 0:
            return "pending"
        return "running"

    # normal steps
    if receive == 0 and total == 0:
        return "pending"

    if total > 0 and total < receive:
        return "running"

    if receive > 0 and total == receive:
        return "passed"

    return "pending"