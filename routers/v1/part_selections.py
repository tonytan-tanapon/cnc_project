from typing import List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from database import get_db
from models import (
  Part, PartProcessSelection, PartFinishSelection, PartOtherNote,
  ManufacturingProcess, ChemicalFinish
)

sel_router = APIRouter(prefix="/part-selections", tags=["part-selections"])

class SelectionIn(BaseModel):
  process_ids: List[int] = []
  finish_ids: List[int] = []
  others: List[str] = []

@sel_router.get("/{part_id}", response_model=SelectionIn)
def get_sel(part_id: int, db: Session = Depends(get_db)):
  part = db.get(Part, part_id)
  if not part: raise HTTPException(404, "Part not found")
  return SelectionIn(
    process_ids=[s.process_id for s in part.processes],
    finish_ids=[s.finish_id for s in part.finishes],
    others=[o.note for o in part.other_notes],
  )

@sel_router.post("/{part_id}", response_model=SelectionIn)
def save_sel(part_id: int, payload: SelectionIn, db: Session = Depends(get_db)):
  part = db.get(Part, part_id)
  if not part: raise HTTPException(404, "Part not found")

  db.query(PartProcessSelection).filter_by(part_id=part_id).delete()
  db.query(PartFinishSelection).filter_by(part_id=part_id).delete()
  db.query(PartOtherNote).filter_by(part_id=part_id).delete()

  for pid in payload.process_ids:
    if not db.get(ManufacturingProcess, pid):
      raise HTTPException(400, f"Invalid process_id {pid}")
    db.add(PartProcessSelection(part_id=part_id, process_id=pid))

  for fid in payload.finish_ids:
    if not db.get(ChemicalFinish, fid):
      raise HTTPException(400, f"Invalid finish_id {fid}")
    db.add(PartFinishSelection(part_id=part_id, finish_id=fid))

  for note in payload.others:
    note = (note or '').strip()
    if note:
      db.add(PartOtherNote(part_id=part_id, category="OTHER", note=note))

  try:
    db.commit()
  except IntegrityError:
    db.rollback()
    raise HTTPException(400, "Constraint error while saving")
  return get_sel(part_id, db)
