# routers/materials.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models import RawMaterial
from schemas import RawMaterialCreate, RawMaterialUpdate, RawMaterialOut

router = APIRouter(prefix="/materials", tags=["materials"])


@router.post("", response_model=RawMaterialOut)
def create_material(payload: RawMaterialCreate, db: Session = Depends(get_db)):
    code = payload.code.strip().upper()
    # กัน code ซ้ำ
    if db.query(RawMaterial).filter(RawMaterial.code == code).first():
        raise HTTPException(409, "Material code already exists")

    m = RawMaterial(
        code=code,
        name=payload.name.strip(),
        spec=payload.spec,
        uom=payload.uom,
        remark=payload.remark,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


@router.get("", response_model=List[RawMaterialOut])
def list_materials(db: Session = Depends(get_db)):
    return db.query(RawMaterial).order_by(RawMaterial.id.desc()).all()


@router.get("/{mat_id}", response_model=RawMaterialOut)
def get_material(mat_id: int, db: Session = Depends(get_db)):
    m = db.get(RawMaterial, mat_id)
    if not m:
        raise HTTPException(404, "Material not found")
    return m


@router.put("/{mat_id}", response_model=RawMaterialOut)
def update_material(mat_id: int, payload: RawMaterialUpdate, db: Session = Depends(get_db)):
    m = db.get(RawMaterial, mat_id)
    if not m:
        raise HTTPException(404, "Material not found")

    # อัปเดตเฉพาะฟิลด์ที่ส่งมา
    for k, v in payload.dict(exclude_unset=True).items():
        setattr(m, k, v)

    db.commit()
    db.refresh(m)
    return m


@router.delete("/{mat_id}")
def delete_material(mat_id: int, db: Session = Depends(get_db)):
    m = db.get(RawMaterial, mat_id)
    if not m:
        raise HTTPException(404, "Material not found")

    # กันลบถ้ามีการใช้งาน batch แล้ว
    if m.batches:
        raise HTTPException(400, "Material has batches; cannot delete")

    db.delete(m)
    db.commit()
    return {"message": "Material deleted"}
