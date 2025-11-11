# utils/code_generator.py
import re
from datetime import datetime
from sqlalchemy.orm import Session

def next_code(db: Session, model, field: str, prefix: str, width: int) -> str:
    """
    Running ต่อเนื่องแบบ PREFIX#### เช่น C0001, PO0001
    """
    col = getattr(model, field)
    pat = re.compile(rf"^{re.escape(prefix)}(\d+)$")
    max_n = 0
    for (code,) in db.query(col).filter(col.like(f"{prefix}%")).all():
        m = pat.match(code or "")
        if m:
            n = int(m.group(1))
            if n > max_n: max_n = n
    return f"{prefix}{str(max_n+1).zfill(width)}"

def next_code_yearly(db: Session, model, field: str, prefix: str, width: int = 4, year: int | None = None) -> str:
    """
    Running แยกปี: PREFIX-YYYY-#### เช่น PO-2025-0001
    """
    y = (year or datetime.now().year) % 100 # เอาแค่สองหลักท้าย
    col = getattr(model, field)
    base = f"{prefix}{y}"
    pat = re.compile(rf"^{re.escape(prefix)}{y}(\d+)$")
    max_n = 0
    for (code,) in db.query(col).filter(col.like(f"{base}%")).all():
        m = pat.match(code or "")
        if m:
            n = int(m.group(1))
            if n > max_n: max_n = n
    return f"{base}{str(max_n+1).zfill(width)}" # Return the next code example: "PO250001"
