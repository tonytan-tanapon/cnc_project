# routers/v1/widgets.py
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from sqlalchemy import or_
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from database import get_db
from models import Widget, WidgetChild  # <- เปลี่ยนเป็นของจริง

router = APIRouter(prefix="/widgets", tags=["widgets"])

# --- Schemas ---
# เปลี่ยนชื่อ field ให้ตรงกับ model จริง
class WidgetCreate(BaseModel):
    code: str
    name: Optional[str] = None
    uom: Optional[str] = None
    status: Optional[str] = "active"
    note: str = ""

class WidgetUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    uom: Optional[str] = None
    status: Optional[str] = None
    note: Optional[str] = None

class WidgetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    name: Optional[str] = None
    uom: Optional[str] = None
    status: Optional[str] = None
    note: Optional[str] = None

def to_out(m: Widget) -> WidgetOut:
    return WidgetOut(
        id=m.id,
        code=m.code,
        name=m.name,
        uom=m.default_uom,  # mapping DB->API
        status=m.status,
        note=m.note,
    )

# --- List ---
@router.get("/", response_model=dict)
def list_widgets(
    q: Optional[str] = Query(default=None),
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
):
    page = max(1, page); page_size = min(max(1, page_size), 200)
    query = db.query(Widget)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(Widget.code.ilike(like), Widget.name.ilike(like)))
    total = query.count()
    items = (query.order_by(Widget.id.desc())
                  .offset((page-1)*page_size).limit(page_size).all())
    return {""
    "items":[to_out(i) for i in items], 
    "total": total, 
    "page": page, 
    "page_size": page_size}

# --- Create ---
@router.post("/", response_model=WidgetOut, status_code=201)
def create_widget(payload: WidgetCreate, db: Session = Depends(get_db)):
    m = Widget(code=payload.code, name=payload.name,
               default_uom=payload.uom or "ea",
               status=payload.status or "active",
               note=payload.note)
    db.add(m)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Duplicate code")
    db.refresh(m)
    return to_out(m)

# --- Get/Update/Delete ---
@router.get("/{wid}", response_model=WidgetOut)
def get_widget(wid: int, db: Session = Depends(get_db)):
    m = db.query(Widget).get(wid)
    if not m: raise HTTPException(404, "Not found")
    return to_out(m)

@router.patch("/{wid}", response_model=WidgetOut)
def update_widget(wid: int, payload: WidgetUpdate, db: Session = Depends(get_db)):
    m = db.query(Widget).get(wid)
    if not m: raise HTTPException(404, "Not found")

    if payload.code is not None: m.code = payload.code
    if payload.name is not None: m.name = payload.name
    if payload.uom is not None: m.default_uom = payload.uom
    if payload.status is not None: m.status = payload.status
    if payload.note is not None: m.note = payload.note
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Duplicate code")
    db.refresh(m)
    return to_out(m)

@router.delete("/{wid}", status_code=204)
def delete_widget(wid: int, db: Session = Depends(get_db)):
    m = db.query(Widget).get(wid)
    if not m: raise HTTPException(404, "Not found")
    db.delete(m)
    db.commit()
    return None

# --- Suggest ---
@router.get("/suggest", response_model=List[dict])
def suggest_widgets(q: str, limit: int = 10, db: Session = Depends(get_db)):
    like = f"%{q}%"
    rows = (db.query(Widget).filter(or_(Widget.code.ilike(like), Widget.name.ilike(like)))
            .order_by(Widget.code).limit(limit).all())
    return [{"id": r.id, 
             "code": r.code, 
             "name": r.name} for r in rows]

# --- Nested children (ตัวอย่าง) ---
class ChildCreate(BaseModel):
    rev: str
    spec: Optional[str] = None
    is_current: bool = False

class ChildUpdate(BaseModel):
    rev: Optional[str] = None
    spec: Optional[str] = None
    is_current: Optional[bool] = None

@router.get("/{wid}/children", response_model=List[dict])
def list_children(wid: int, db: Session = Depends(get_db)):
    # ... query ...
    return []

@router.post("/{wid}/children", response_model=dict, status_code=201)
def create_child(wid: int, payload: ChildCreate, db: Session = Depends(get_db)):
    # ... insert + 409 on duplicate ...
    return {}
