from typing import Callable, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Body, status
from sqlalchemy.orm import Session
from sqlalchemy import select
from database import get_db
from utils import sa_to_dict, sa_update_from_dict

def make_crud_router(
    Model,
    prefix: str,
    pk: str = "id",
    list_order_by: Optional = None,
    unique_fields: Optional[List[str]] = None,
    create_defaults: Optional[Callable[[dict], dict]] = None,
    before_create: Optional[Callable[[Session, dict], None]] = None,
    before_update: Optional[Callable[[Session, object, dict], None]] = None,
):
    """
    สร้าง CRUD router ให้ Model:
    - GET /{prefix}            : list
    - GET /{prefix}/{id}       : get one
    - POST /{prefix}           : create
    - PUT /{prefix}/{id}       : update
    - DELETE /{prefix}/{id}    : delete
    """
    router = APIRouter(prefix=f"/{prefix}", tags=[prefix])

    # List
    @router.get("")
    def list_items(db: Session = Depends(get_db)):
        stmt = select(Model)
        if list_order_by is not None:
            stmt = stmt.order_by(list_order_by)
        rows = db.scalars(stmt).all()
        return [sa_to_dict(r) for r in rows]

    # Get one
    @router.get("/{item_id}")
    def get_item(item_id: int, db: Session = Depends(get_db)):
        obj = db.get(Model, item_id)
        if not obj:
            raise HTTPException(status_code=404, detail="Not found")
        return sa_to_dict(obj)

    # Create
    @router.post("", status_code=status.HTTP_201_CREATED)
    def create_item(payload: dict = Body(...), db: Session = Depends(get_db)):
        data = dict(payload or {})
        # defaults
        if create_defaults:
            data = {**data, **(create_defaults(data) or {})}

        # unique checks
        if unique_fields:
            for f in unique_fields:
                if f in data and data[f] is not None:
                    exists = db.scalars(select(Model).where(getattr(Model, f) == data[f])).first()
                    if exists:
                        raise HTTPException(status_code=409, detail=f"{f} already exists")

        # custom validation
        if before_create:
            before_create(db, data)

        obj = Model()
        sa_update_from_dict(obj, data)
        db.add(obj)
        db.commit()
        db.refresh(obj)
        return sa_to_dict(obj)

    # Update
    @router.put("/{item_id}")
    def update_item(item_id: int, payload: dict = Body(...), db: Session = Depends(get_db)):
        obj = db.get(Model, item_id)
        if not obj:
            raise HTTPException(status_code=404, detail="Not found")

        data = dict(payload or {})

        # unique checks (ยกเว้นค่าของตัวเอง)
        if unique_fields:
            for f in unique_fields:
                if f in data and data[f] is not None:
                    exists = db.scalars(select(Model).where(getattr(Model, f) == data[f])).first()
                    if exists and getattr(exists, pk) != getattr(obj, pk):
                        raise HTTPException(status_code=409, detail=f"{f} already exists")

        if before_update:
            before_update(db, obj, data)

        sa_update_from_dict(obj, data)
        db.commit()
        db.refresh(obj)
        return sa_to_dict(obj)

    # Delete
    @router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_item(item_id: int, db: Session = Depends(get_db)):
        obj = db.get(Model, item_id)
        if not obj:
            raise HTTPException(status_code=404, detail="Not found")
        db.delete(obj)
        db.commit()
        return None

    return router
