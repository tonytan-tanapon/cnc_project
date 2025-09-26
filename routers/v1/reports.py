# routers/reports.py
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from typing import Optional, Dict, List
from decimal import Decimal, ROUND_DOWN
from database import get_db
from models import LotMaterialUse

router = APIRouter(prefix="/reports", tags=["reports"])

def _parse_ids_from_request(request: Request, csv_fallback: Optional[str]) -> List[int]:
    ids: List[int] = []
    def add(tok: str):
        tok = tok.strip()
        if not tok:
            return
        try:
            n = int(tok)
            if n > 0:
                ids.append(n)
        except ValueError:
            pass
    for v in request.query_params.getlist("lot_ids"):
        for tok in v.split(","):
            add(tok)
    if csv_fallback:
        for tok in csv_fallback.split(","):
            add(tok)
    return sorted(set(ids))

@router.get("/lot-consumption")   # ← เพิ่มบรรทัดนี้
def get_lot_consumption(
    request: Request,
    lot_ids_csv: Optional[str] = Query(None, description="comma-separated lot ids"),
    db: Session = Depends(get_db),
) -> Dict[str, str]:
    ids = _parse_ids_from_request(request, lot_ids_csv)
    if not ids:
        return {}
    rows = db.execute(
        select(
            LotMaterialUse.lot_id,
            func.coalesce(func.sum(LotMaterialUse.qty), 0).label("qty_used"),
        )
        .where(LotMaterialUse.lot_id.in_(ids))
        .group_by(LotMaterialUse.lot_id)
    ).all()

    result: Dict[str, str] = {str(i): "0.000" for i in ids}
    for lot_id, qty_used in rows:
        q = Decimal(qty_used).quantize(Decimal("0.000"), rounding=ROUND_DOWN)
        result[str(lot_id)] = str(q)
    return result
