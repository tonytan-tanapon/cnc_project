# routers/v1/traveler_templates.py

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import func
from pydantic import BaseModel, ConfigDict
from typing import Optional, List

from database import get_db
from models import (
    TravelerTemplate,
    TravelerTemplateStep,
    ShopTraveler,
    ShopTravelerStep,
)

router = APIRouter(
    prefix="/traveler-templates",
    tags=["Traveler Templates"],
)


# =========================
# SCHEMAS
# =========================

class TemplateStepIn(BaseModel):
    seq: int
    step_code: Optional[str] = None
    step_name: Optional[str] = None
    step_detail: Optional[str] = None
    station: Optional[str] = None
    qa_required: bool = False
    note: Optional[str] = None


class TemplateCreate(BaseModel):
    part_id: int
    part_revision_id: Optional[int] = None
    customer_id: Optional[int] = None
    template_name: str
    note: Optional[str] = None
    created_by_id: Optional[int] = None
    steps: Optional[List[TemplateStepIn]] = []


class TemplateUpdate(BaseModel):
    template_name: Optional[str] = None
    customer_id: Optional[int] = None
    is_active: Optional[bool] = None
    note: Optional[str] = None


class TemplateStepOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    template_id: int
    seq: int
    step_code: Optional[str] = None
    step_name: Optional[str] = None
    step_detail: Optional[str] = None
    station: Optional[str] = None
    qa_required: bool
    note: Optional[str] = None


class TemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    part_id: int
    part_revision_id: Optional[int] = None
    customer_id: Optional[int] = None
    template_name: str
    version: int
    is_active: bool
    created_by_id: Optional[int] = None
    note: Optional[str] = None
    steps: List[TemplateStepOut] = []


# =========================
# HELPERS
# =========================

def next_template_version(db: Session, part_id: int, part_revision_id: Optional[int]) -> int:
    max_version = (
        db.query(func.max(TravelerTemplate.version))
        .filter(
            TravelerTemplate.part_id == part_id,
            TravelerTemplate.part_revision_id == part_revision_id,
        )
        .scalar()
    )

    return (max_version or 0) + 1


def copy_template_step(template_id: int, s) -> TravelerTemplateStep:
    return TravelerTemplateStep(
        template_id=template_id,
        seq=s.seq,
        step_code=getattr(s, "step_code", None),
        step_name=getattr(s, "step_name", None),
        step_detail=getattr(s, "step_detail", None),
        station=getattr(s, "station", None),
        qa_required=getattr(s, "qa_required", False) or False,
        note=getattr(s, "note", None),
    )


def copy_to_traveler_step(traveler_id: int, s) -> ShopTravelerStep:
    return ShopTravelerStep(
        traveler_id=traveler_id,
        seq=s.seq,
        step_code=s.step_code,
        step_name=s.step_name,
        step_detail=s.step_detail,
        station=s.station,
        qa_required=s.qa_required,
        note=s.note,
    )


# =========================
# TEMPLATE CRUD
# =========================

@router.get("")
def list_templates(
    q: Optional[str] = Query(None),
    active: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(TravelerTemplate)

    if q:
        like = f"%{q}%"
        query = query.filter(TravelerTemplate.template_name.ilike(like))

    if active is not None:
        query = query.filter(TravelerTemplate.is_active == active)

    items = (
        query.options(selectinload(TravelerTemplate.steps))
        .order_by(TravelerTemplate.id.desc())
        .all()
    )

    return {
        "items": items,
        "total": len(items),
    }


@router.get("/{template_id}", response_model=TemplateOut)
def get_template(template_id: int, db: Session = Depends(get_db)):
    tpl = (
        db.query(TravelerTemplate)
        .options(selectinload(TravelerTemplate.steps))
        .filter(TravelerTemplate.id == template_id)
        .first()
    )

    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")

    return tpl


@router.post("", response_model=TemplateOut)
def create_template(data: TemplateCreate, db: Session = Depends(get_db)):
    version = next_template_version(
        db,
        data.part_id,
        data.part_revision_id,
    )

    tpl = TravelerTemplate(
        part_id=data.part_id,
        part_revision_id=data.part_revision_id,
        customer_id=data.customer_id,
        template_name=data.template_name,
        version=version,
        is_active=True,
        note=data.note,
        created_by_id=data.created_by_id,
    )

    db.add(tpl)
    db.flush()

    for s in data.steps or []:
        db.add(
            TravelerTemplateStep(
                template_id=tpl.id,
                seq=s.seq,
                step_code=s.step_code,
                step_name=s.step_name,
                step_detail=s.step_detail,
                station=s.station,
                qa_required=s.qa_required,
                note=s.note,
            )
        )

    db.commit()
    db.refresh(tpl)

    tpl = (
        db.query(TravelerTemplate)
        .options(selectinload(TravelerTemplate.steps))
        .filter(TravelerTemplate.id == tpl.id)
        .first()
    )

    return tpl


@router.put("/{template_id}", response_model=TemplateOut)
def update_template(
    template_id: int,
    data: TemplateUpdate,
    db: Session = Depends(get_db),
):
    tpl = (
        db.query(TravelerTemplate)
        .options(selectinload(TravelerTemplate.steps))
        .filter(TravelerTemplate.id == template_id)
        .first()
    )

    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")

    patch = data.model_dump(exclude_unset=True)

    for key, value in patch.items():
        setattr(tpl, key, value)

    db.commit()
    db.refresh(tpl)

    return tpl


@router.delete("/{template_id}")
def delete_template(template_id: int, db: Session = Depends(get_db)):
    tpl = db.query(TravelerTemplate).filter(TravelerTemplate.id == template_id).first()

    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")

    db.delete(tpl)
    db.commit()

    return {"ok": True, "deleted_id": template_id}


# =========================
# TEMPLATE STEPS
# =========================

@router.put("/{template_id}/steps")
def replace_template_steps(
    template_id: int,
    steps: List[TemplateStepIn],
    db: Session = Depends(get_db),
):
    tpl = db.query(TravelerTemplate).filter(TravelerTemplate.id == template_id).first()

    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")

    db.query(TravelerTemplateStep).filter(
        TravelerTemplateStep.template_id == template_id
    ).delete(synchronize_session=False)

    for s in steps:
        db.add(
            TravelerTemplateStep(
                template_id=template_id,
                seq=s.seq,
                step_code=s.step_code,
                step_name=s.step_name,
                step_detail=s.step_detail,
                station=s.station,
                qa_required=s.qa_required,
                note=s.note,
            )
        )

    db.commit()

    return {"ok": True}


@router.post("/{template_id}/steps", response_model=TemplateStepOut)
def add_template_step(
    template_id: int,
    step: TemplateStepIn,
    db: Session = Depends(get_db),
):
    tpl = db.query(TravelerTemplate).filter(TravelerTemplate.id == template_id).first()

    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")

    new_step = TravelerTemplateStep(
        template_id=template_id,
        seq=step.seq,
        step_code=step.step_code,
        step_name=step.step_name,
        step_detail=step.step_detail,
        station=step.station,
        qa_required=step.qa_required,
        note=step.note,
    )

    db.add(new_step)
    db.commit()
    db.refresh(new_step)

    return new_step


@router.delete("/steps/{step_id}")
def delete_template_step(step_id: int, db: Session = Depends(get_db)):
    step = db.query(TravelerTemplateStep).filter(TravelerTemplateStep.id == step_id).first()

    if not step:
        raise HTTPException(status_code=404, detail="Template step not found")

    db.delete(step)
    db.commit()

    return {"ok": True, "deleted_id": step_id}


# =========================
# VERSIONING
# =========================

@router.post("/{template_id}/new-version", response_model=TemplateOut)
def create_new_version(template_id: int, db: Session = Depends(get_db)):
    old = (
        db.query(TravelerTemplate)
        .options(selectinload(TravelerTemplate.steps))
        .filter(TravelerTemplate.id == template_id)
        .first()
    )

    if not old:
        raise HTTPException(status_code=404, detail="Template not found")

    new_version_no = next_template_version(
        db,
        old.part_id,
        old.part_revision_id,
    )

    new_tpl = TravelerTemplate(
        part_id=old.part_id,
        part_revision_id=old.part_revision_id,
        customer_id=old.customer_id,
        template_name=old.template_name,
        version=new_version_no,
        is_active=True,
        note=old.note,
        created_by_id=old.created_by_id,
    )

    db.add(new_tpl)
    db.flush()

    for s in old.steps:
        db.add(copy_template_step(new_tpl.id, s))

    db.commit()
    db.refresh(new_tpl)

    new_tpl = (
        db.query(TravelerTemplate)
        .options(selectinload(TravelerTemplate.steps))
        .filter(TravelerTemplate.id == new_tpl.id)
        .first()
    )

    return new_tpl


# =========================
# TRAVELER -> TEMPLATE
# =========================

@router.post("/from-traveler/{traveler_id}", response_model=TemplateOut)
def create_template_from_traveler(
    traveler_id: int,
    db: Session = Depends(get_db),
):
    traveler = (
        db.query(ShopTraveler)
        .options(
            selectinload(ShopTraveler.steps),
            selectinload(ShopTraveler.lot),
        )
        .filter(ShopTraveler.id == traveler_id)
        .first()
    )

    if not traveler:
        raise HTTPException(status_code=404, detail="Traveler not found")

    if not traveler.lot:
        raise HTTPException(status_code=400, detail="Traveler has no lot")

    part_id = traveler.lot.part_id
    part_revision_id = traveler.lot.part_revision_id

    version = next_template_version(db, part_id, part_revision_id)

    tpl = TravelerTemplate(
        part_id=part_id,
        part_revision_id=part_revision_id,
        customer_id=getattr(traveler.lot, "customer_id", None),
        template_name=f"{traveler.traveler_no or 'Traveler'} Template",
        version=version,
        is_active=True,
        note=getattr(traveler, "notes", None),
        created_by_id=getattr(traveler, "created_by_id", None),
    )

    db.add(tpl)
    db.flush()

    for s in traveler.steps:
        db.add(copy_template_step(tpl.id, s))

    db.commit()
    db.refresh(tpl)

    tpl = (
        db.query(TravelerTemplate)
        .options(selectinload(TravelerTemplate.steps))
        .filter(TravelerTemplate.id == tpl.id)
        .first()
    )

    return tpl


# =========================
# TEMPLATE -> TRAVELER
# =========================

@router.post("/{template_id}/create-traveler")
def create_traveler_from_template(
    template_id: int,
    lot_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    tpl = (
        db.query(TravelerTemplate)
        .options(selectinload(TravelerTemplate.steps))
        .filter(TravelerTemplate.id == template_id)
        .first()
    )

    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")

    traveler = ShopTraveler(
        lot_id=lot_id,
        traveler_no=None,
        status="open",
    )

    db.add(traveler)
    db.flush()

    for s in tpl.steps:
        db.add(copy_to_traveler_step(traveler.id, s))

    db.commit()
    db.refresh(traveler)

    return traveler