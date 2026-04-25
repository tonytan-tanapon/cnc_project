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
    station=payload.station,
    operator_id=payload.operator_id,
    qa_required=payload.qa_required or False,
    status="pending" if not payload.status else payload.status,
    qty_receive=payload.qty_receive or 0,
    qty_accept=payload.qty_accept or 0,
    qty_reject=payload.qty_reject or 0,
    step_note=payload.step_note,          # 👈 ใหม่
    step_detail=payload.step_detail or "",  
)
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@router.get("", response_model=List[ShopTravelerStepOut])
def list_traveler_steps(traveler_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(ShopTravelerStep)
    if traveler_id:
        q = q.filter(ShopTravelerStep.traveler_id == traveler_id).order_by(ShopTravelerStep.seq.asc())
    else:
        q = q.order_by(ShopTravelerStep.id.desc())
    return q.all()


@router.get("/{step_id}", response_model=ShopTravelerStepOut)
def get_traveler_step(step_id: int, db: Session = Depends(get_db)):
    s = db.get(ShopTravelerStep, step_id)
    if not s:
        raise HTTPException(404, "Step not found")
    return s


@router.put("/{step_id}", response_model=ShopTravelerStepOut)
def update_traveler_step(step_id: int, payload: ShopTravelerStepUpdate, db: Session = Depends(get_db)):
    s = db.get(ShopTravelerStep, step_id)
    if not s:
        raise HTTPException(404, "Step not found")

    data = payload.dict(exclude_unset=True)

    # ถ้ามีการเปลี่ยน seq ต้องไม่ชนภายใน traveler เดียวกัน
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

    # เปลี่ยน operator ต้องมีจริง
    if "operator_id" in data and data["operator_id"] is not None:
        if not db.get(Employee, data["operator_id"]):
            raise HTTPException(404, "Operator not found")

    # อัปเดตฟิลด์ที่เหลือ
    for k, v in data.items():
        setattr(s, k, v)

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


# @router.post("/{step_id}/finish", response_model=ShopTravelerStepOut)
# def finish_step(
#     step_id: int,
#     result: str = "passed",
#     qa_result: Optional[str] = None,
#     qa_notes: Optional[str] = None,
#     qty_receive: Optional[Decimal] = None,
#     qty_accept: Optional[Decimal] = None,
#     qty_reject: Optional[Decimal] = None,
#     db: Session = Depends(get_db),
# ):
    
#     # print("Finishing step", step_id, "with result", result) 
#     s = db.get(ShopTravelerStep, step_id)
#     if not s:
#         raise HTTPException(404, "Step not found")
#     if result not in ["passed", "failed", "skipped"]:
#         raise HTTPException(400, "result must be passed/failed/skipped")

#     print("Updating step status to", result)
#     # ✅ อัปเดต qty ถ้ามีส่งมา
#     if qty_receive is not None: s.qty_receive = qty_receive
#     if qty_accept  is not None: s.qty_accept  = qty_accept
#     if qty_reject  is not None: s.qty_reject  = qty_reject

#     # ✅ validation ง่ายๆ (ถ้ามีรับเข้า)
#     if s.qty_receive is not None and (s.qty_accept or 0) + (s.qty_reject or 0) > (s.qty_receive or 0):
#         raise HTTPException(400, "qty_accept + qty_reject must not exceed qty_receive")

#     s.status = result
#     s.finished_at = datetime.utcnow()
#     if qa_result is not None: s.qa_result = qa_result
#     if qa_notes  is not None: s.qa_notes  = qa_notes

#     db.commit()
#     db.refresh(s)
#     return s


from schemas import StepFinishRequest

# @router.post("/{step_id}/finish", response_model=ShopTravelerStepOut)
# def finish_step(
#     step_id: int,
#     payload: StepFinishRequest,   # ✅ รับ JSON
#     db: Session = Depends(get_db),
# ):
#     s = db.get(ShopTravelerStep, step_id)
#     if not s:
#         raise HTTPException(404, "Step not found")

#     result = payload.result or "passed"

#     if result not in ["passed", "failed", "skipped"]:
#         raise HTTPException(400, "Invalid result")

#     # =========================
#     # qty update
#     # =========================
#     if payload.qty_receive is not None:
#         s.qty_receive = payload.qty_receive

#     if payload.qty_accept is not None:
#         s.qty_accept = payload.qty_accept

#     if payload.qty_reject is not None:
#         s.qty_reject = payload.qty_reject

#     # =========================
#     # validation
#     # =========================
#     if (
#         s.qty_receive is not None and
#         (s.qty_accept or 0) + (s.qty_reject or 0) > (s.qty_receive or 0)
#     ):
#         raise HTTPException(400, "qty_accept + qty_reject > qty_receive")

#     # =========================
#     # auto start (optional 🔥)
#     # =========================
#     if s.status == "pending":
#         s.started_at = datetime.utcnow()

#     # =========================
#     # finish
#     # =========================
#     s.status = result
#     s.finished_at = datetime.utcnow()

#     if payload.qa_result is not None:
#         s.qa_result = payload.qa_result

#     if payload.qa_notes is not None:
#         s.qa_notes = payload.qa_notes

#     db.commit()
#     db.refresh(s)

#     return s
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
    if payload.qty_receive is not None:
        s.qty_receive = payload.qty_receive

    if payload.qty_accept is not None:
        s.qty_accept = payload.qty_accept

    if payload.qty_reject is not None:
        s.qty_reject = payload.qty_reject

    # =========================
    # VALIDATION
    # =========================
    if (
        s.qty_receive is not None and
        (s.qty_accept or 0) + (s.qty_reject or 0) > (s.qty_receive or 0)
    ):
        raise HTTPException(400, "qty_accept + qty_reject > qty_receive")

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
            s.qty_receive = 0
            s.qty_accept = 0
            s.qty_reject = 0

            if item:
                db.delete(item)

            db.commit()
            db.refresh(s)
            return s

        # =========================
        # 🧠 CALCULATE AVAILABLE
        # =========================
        # 🔥 ใช้ step นี้เลย (สำคัญมาก)
        finished_qty = float(s.qty_accept or 0)

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
    s.result = None               # ถ้ามี field เก็บผล
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
 