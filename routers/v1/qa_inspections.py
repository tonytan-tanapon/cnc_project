# routers/qa_inspections.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import QAInspection, QAInspectionItem
from schemas import (
    QAInspectionCreate,
    QAInspectionItemCreate,
    QAInspectionItemUpdate,
)

router = APIRouter(prefix="/qa-inspections", tags=["qa-inspections"])

@router.get("/by-lot/{lot_id}")
def get_inspection(lot_id: int, db: Session = Depends(get_db)):
    qa = (
        db.query(QAInspection)
        .filter(QAInspection.lot_id == lot_id)
        .first()
    )
    return qa

@router.post("")
def create_inspection(payload: QAInspectionCreate, db: Session = Depends(get_db)):
    qa = QAInspection(
        lot_id=payload.lot_id,
        inspector_id=payload.inspector_id,
        remarks=payload.remarks,
    )
    db.add(qa)
    db.commit()
    db.refresh(qa)
    return qa



@router.get("/{inspection_id}/items")
def get_items(inspection_id: int, db: Session = Depends(get_db)):
    return (
        db.query(QAInspectionItem)
        .filter(QAInspectionItem.inspection_id == inspection_id)
        .order_by(QAInspectionItem.seq)
        .all()
    )


@router.post("/{inspection_id}/items")
def add_item(
    inspection_id: int,
    payload: QAInspectionItemCreate,
    db: Session = Depends(get_db),
):
    item = QAInspectionItem(
        inspection_id=inspection_id,
        **payload.dict()
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item

@router.put("/qa-items/{item_id}")
def update_item(
    item_id: int,
    payload: QAInspectionItemUpdate,
    db: Session = Depends(get_db),
):
    item = db.get(QAInspectionItem, item_id)
    if not item:
        raise HTTPException(404, "Item not found")

    for k, v in payload.dict(exclude_unset=True).items():
        setattr(item, k, v)

    db.commit()
    db.refresh(item)
    return item

@router.delete("/qa-items/{item_id}")
def delete_item(item_id: int, db: Session = Depends(get_db)):
    item = db.get(QAInspectionItem, item_id)
    if not item:
        raise HTTPException(404, "Item not found")

    db.delete(item)
    db.commit()
    return {"ok": True}

from models import (
    QAInspection,
    QAInspectionItem,
    QAInspectionTemplate,
    QAInspectionTemplateItem,
)
@router.get("/templates/active")
def get_active_template(db: Session = Depends(get_db)):
    print("inspection")
    tmpl = (
        db.query(QAInspectionTemplate)
        .filter(QAInspectionTemplate.active == True)
        .first()
    )

    if not tmpl:
        raise HTTPException(404, "No active QA template found")

    return tmpl

@router.post("/apply-template/{inspection_id}")
def apply_template(
    inspection_id: int,
    template_id: int,
    db: Session = Depends(get_db),
):
    inspection = db.get(QAInspection, inspection_id)
    if not inspection:
        raise HTTPException(404, "Inspection not found")

    items = (
        db.query(QAInspectionTemplateItem)
        .filter(QAInspectionTemplateItem.template_id == template_id)
        .order_by(QAInspectionTemplateItem.seq)
        .all()
    )

    if not items:
        raise HTTPException(404, "Template has no items")

    # ลบ item เก่า
    db.query(QAInspectionItem).filter(
        QAInspectionItem.inspection_id == inspection_id
    ).delete()

    # copy item จาก template
    for it in items:
        new_item = QAInspectionItem(
            inspection_id=inspection_id,
            seq=it.seq,
            op_no=it.op_no,
            bb_no=it.bb_no,
            dimension=it.dimension,
            actual_value=None,
            result=None,
            notes=None,
            emp_id=None,
        )
        db.add(new_item)

    db.commit()

    return {"ok": True, "count": len(items)}
