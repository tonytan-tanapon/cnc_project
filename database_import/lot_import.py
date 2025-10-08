#!/usr/bin/env python3
"""
CSV import / upsert script:
- Upserts Customer (from CSV column 'Name' -> customer.code)
- Upserts Part, PartRevision
- Upserts PO (requires NOT NULL customer_id; falls back to DEFAULT customer)
- Upserts POLine (due_date = CSV 'Original')
- Upserts ProductionLot with:
    lot_due_date = Original - 60 days
    started_at   = Original - 30 days (00:00 UTC)
- Appends 'Need/Remark' into Part.description (once per run)
- Preflight sequence repair to avoid PK collisions
- Timezone-safe datetime handling
"""

from __future__ import annotations

import csv
from decimal import Decimal
from pathlib import Path
from typing import Optional, Iterable, Dict

from datetime import datetime, date, time, timedelta, timezone

from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session, sessionmaker

import sys, os
# make project root importable
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# --- your models ---
from models import (
    Customer,
    Part,
    PartRevision,
    PO,
    POLine,
    ProductionLot,
)

# ------------------ CONFIG ------------------
DATABASE_URL = "postgresql+psycopg2://postgres:1234@localhost:5432/mydb"
CSV_FILE = Path(r"C:\Users\TPSERVER\dev\cnc_project\database_import\lot_import.csv")
CSV_ENCODING = "utf-8-sig"
CSV_DELIMITER = ","  # set to "\t" if your file is tab-separated

# If a CSV row has no 'Name' (customer), we’ll attach this fallback customer.
DEFAULT_CUSTOMER_CODE = "CSV-IMPORT"
DEFAULT_CUSTOMER_NAME = "CSV Import (unknown customer)"

# Map incoming Name -> existing customer code (optional)
CUSTOMER_CODE_MAP: Dict[str, str] = {
    # "DK9811": "DK9811",
}
# -------------------------------------------

engine = create_engine(DATABASE_URL, future=True)
SessionLocal = sessionmaker(bind=engine, class_=Session, autoflush=False, autocommit=False, future=True)


# =============== Helpers ===================

def pick(d: dict, *keys: str) -> Optional[str]:
    """Return first non-empty string among given keys (trimmed)."""
    for k in keys:
        if k in d:
            v = d.get(k)
        else:
            # try a softened lookup where we strip surrounding spaces in header names
            cand = next((kk for kk in d.keys() if kk.strip() == k.strip()), None)
            v = d.get(cand) if cand else None
        if v is not None:
            s = str(v).strip()
            if s != "":
                return s
    return None

def clean_money(s: Optional[str]) -> Optional[Decimal]:
    if not s:
        return None
    t = str(s).replace(",", "").replace("$", "").strip()
    if not t:
        return None
    try:
        return Decimal(t)
    except Exception:
        return None

def parse_int(s: Optional[str]) -> Optional[int]:
    if s is None:
        return None
    txt = str(s).strip().replace(",", "")
    if txt == "":
        return None
    try:
        # allow floats that are whole numbers, e.g., "25.0"
        f = float(txt)
        i = int(round(f))
        return i
    except Exception:
        return None

def parse_date(s: Optional[str]) -> Optional[date]:
    """
    Try parse dates like MM/DD/YY, MM/DD/YYYY, YYYY-MM-DD, etc.
    Returns a date (no timezone).
    """
    if not s:
        return None
    txt = str(s).strip()
    if not txt:
        return None
    fmts = ("%m/%d/%y", "%m/%d/%Y", "%Y-%m-%d", "%m-%d-%Y", "%d/%m/%Y")
    for fmt in fmts:
        try:
            return datetime.strptime(txt, fmt).date()
        except Exception:
            pass
    try:
        return datetime.fromisoformat(txt).date()
    except Exception:
        return None

def to_utc_midnight(d: Optional[date]) -> Optional[datetime]:
    """date -> UTC datetime at 00:00"""
    if not d:
        return None
    return datetime.combine(d, time.min, tzinfo=timezone.utc)

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

def seconds_since(ts: Optional[datetime]) -> Optional[float]:
    if ts is None:
        return None
    if ts.tzinfo is None:
        # assume UTC if naive
        ts = ts.replace(tzinfo=timezone.utc)
    else:
        ts = ts.astimezone(timezone.utc)
    return (utc_now() - ts).total_seconds()

def stamp_tag() -> str:
    # Tag to avoid duplicate-append of the same Need/Remark block in this run
    return f"[CSV {date.today().isoformat()}]"

def append_note_once(cur: Optional[str], note: str) -> str:
    note = note.strip()
    if not note:
        return cur or ""
    cur = (cur or "").strip()
    tagged = f"{stamp_tag()} {note}"
    if tagged in cur:
        return cur
    return (cur + "\n" + tagged).strip() if cur else tagged


# =============== Sequence Repair ===============

def fix_sequences(db: Session, table_cols: Iterable[tuple[str, str]]):
    """
    Ensure each table's id sequence is set to > max(id).
    table_cols: iterable of tuples (table_name, id_column_name)
    """
    for table_name, id_col in table_cols:
        db.execute(text("""
            SELECT setval(
                pg_get_serial_sequence(:tname, :idcol),
                COALESCE((SELECT MAX({id}) FROM {tbl}), 1) + 1,
                false
            )
        """.format(id=id_col, tbl=table_name)), {"tname": table_name, "idcol": id_col})
    db.commit()


# =============== Upsert APIs ===============

def get_or_upsert_customer(db: Session, raw_name_or_code: Optional[str]) -> Customer:
    """
    Upsert customer by 'code' (taken from Name column).
    If missing, use DEFAULT_CUSTOMER_*.
    Also supports CUSTOMER_CODE_MAP to map CSV name -> known code.
    """
    raw = (raw_name_or_code or "").strip()
    mapped = CUSTOMER_CODE_MAP.get(raw, raw)
    code = mapped or DEFAULT_CUSTOMER_CODE
    cust = db.execute(select(Customer).where(Customer.code == code)).scalar_one_or_none()
    if cust:
        return cust
    cust = Customer(code=code, name=(DEFAULT_CUSTOMER_NAME if code == DEFAULT_CUSTOMER_CODE else code))
    db.add(cust)
    db.flush()
    return cust

def get_or_upsert_part(db: Session, part_no: str, description: Optional[str], need_remark: Optional[str]) -> Part:
    part = db.execute(select(Part).where(Part.part_no == part_no)).scalar_one_or_none()
    if not part:
        desc = (description or "").strip()
        desc = append_note_once(desc, need_remark or "") if need_remark else desc
        part = Part(part_no=part_no, name=part_no, description=(desc or None))
        db.add(part)
        db.flush()
        return part

    # append description once if provided
    changed = False
    if description:
        cur = (part.description or "").strip()
        if description not in cur:
            part.description = (cur + "\n" + description).strip() if cur else description
            changed = True

    # append Need/Remark (tagged) once
    if need_remark:
        new_desc = append_note_once(part.description, need_remark)
        if new_desc != (part.description or ""):
            part.description = new_desc
            changed = True

    if changed:
        db.flush()
    return part

def get_or_upsert_revision(db: Session, part: Part, rev_code: Optional[str]) -> Optional[PartRevision]:
    if not rev_code:
        return None
    pr = db.execute(
        select(PartRevision).where(
            PartRevision.part_id == part.id,
            PartRevision.rev == rev_code
        )
    ).scalar_one_or_none()
    if pr:
        return pr
    pr = PartRevision(part_id=part.id, rev=rev_code, is_current=False)
    db.add(pr)
    db.flush()
    return pr

def get_or_upsert_po(db: Session, po_number: str, customer: Customer) -> PO:
    po = db.execute(select(PO).where(PO.po_number == po_number)).scalar_one_or_none()
    if po:
        # ensure it has a customer (legacy rows might not)
        if not po.customer_id:
            po.customer_id = customer.id
            db.flush()
        return po
    po = PO(po_number=po_number, description=None, customer_id=customer.id)
    db.add(po)
    db.flush()
    return po

def get_or_upsert_poline(
    db: Session,
    po: PO,
    part: Part,
    rev: Optional[PartRevision],
    qty_ordered: Optional[Decimal],
    unit_price: Optional[Decimal],
    due_date: Optional[date],
) -> POLine:
    """
    Creates or updates a PO line. On CREATE, qty_ordered is coerced to 0 if None
    (because the DB column is NOT NULL). On UPDATE, we only change qty if a value
    is provided (leave it as-is if qty_ordered is None).
    """
    target_due_dt = to_utc_midnight(due_date) if due_date else None

    q = select(POLine).where(
        POLine.po_id == po.id,
        POLine.part_id == part.id,
        POLine.revision_id == (rev.id if rev else None),
        POLine.due_date == target_due_dt,
    )
    line = db.execute(q).scalar_one_or_none()

    if not line:
        # 🔧 coalesce qty to 0 on create to satisfy NOT NULL
        qty_val = qty_ordered if qty_ordered is not None else Decimal(0)
        line = POLine(
            po_id=po.id,
            part_id=part.id,
            revision_id=(rev.id if rev else None),
            qty_ordered=qty_val,
            unit_price=unit_price,
            due_date=target_due_dt,
            notes=None,
        )
        db.add(line)
        db.flush()
        return line

    # UPDATE path with gentle changes (and 5s protection)
    recent_sec = seconds_since(line.created_at)
    safe_to_update = (recent_sec is None) or (recent_sec >= 5.0)

    changed = False

    if not line.revision_id and rev:
        line.revision_id = rev.id
        changed = True

    # Only update qty if caller provided a value; otherwise keep existing
    if qty_ordered is not None and line.qty_ordered != qty_ordered and safe_to_update:
        line.qty_ordered = qty_ordered
        changed = True

    if unit_price is not None and line.unit_price != unit_price and safe_to_update:
        line.unit_price = unit_price
        changed = True

    if line.due_date != target_due_dt and safe_to_update:
        line.due_date = target_due_dt
        changed = True

    if changed:
        db.flush()

    return line


def get_or_upsert_lot(
    db: Session,
    lot_no: Optional[str],
    po_line: POLine,
    planned_qty: Optional[Decimal],
    lot_due: Optional[date],
    started_at: Optional[date],
) -> Optional[ProductionLot]:
    if not lot_no:
        return None

    lot = db.execute(select(ProductionLot).where(ProductionLot.lot_no == lot_no)).scalar_one_or_none()
    if not lot:
        lot = ProductionLot(
            lot_no=lot_no,
            part_id=po_line.part_id,
            part_revision_id=po_line.revision_id,
            po_id=po_line.po_id,
            po_line_id=po_line.id,
            planned_qty=int(planned_qty) if planned_qty is not None else 0,
            lot_due_date=lot_due,
            started_at=to_utc_midnight(started_at) if started_at else None,
            status="in_process",
        )
        db.add(lot)
        db.flush()
        return lot

    changed = False
    if lot.po_line_id != po_line.id:
        lot.po_line_id = po_line.id; changed = True
    if lot.part_id != po_line.part_id:
        lot.part_id = po_line.part_id; changed = True
    if lot.part_revision_id != po_line.revision_id:
        lot.part_revision_id = po_line.revision_id; changed = True

    pq = int(planned_qty) if planned_qty is not None else lot.planned_qty
    if pq != lot.planned_qty:
        lot.planned_qty = pq; changed = True

    if lot.lot_due_date != lot_due:
        lot.lot_due_date = lot_due; changed = True

    new_started_dt = to_utc_midnight(started_at) if started_at else None
    if (lot.started_at or None) != (new_started_dt or None):
        lot.started_at = new_started_dt; changed = True

    if changed:
        db.flush()
    return lot


# ================= Main ====================

def main():
    with SessionLocal() as db:
        # Preflight: repair sequences for common tables we touch
        fix_sequences(db, [
            ("customers", "id"),
            ("parts", "id"),
            ("part_revisions", "id"),
            ("purchase_orders", "id"),
            ("po_lines", "id"),
            ("production_lots", "id"),
        ])

        with CSV_FILE.open("r", encoding=CSV_ENCODING, newline="") as f:
            reader = csv.DictReader(f, delimiter=CSV_DELIMITER)
            processed = 0

            for row in reader:
                # customer (from CSV 'Name')
                customer_code = pick(row, "Name", "Customer", "Customer Code")
                customer = get_or_upsert_customer(db, customer_code)

                # part data
                part_no = pick(row, "Part No.", "Part No")
                description = pick(row, "Description")
                rev_code = pick(row, "Rev.", "Rev")
                need_remark = pick(row, "Need/Remark", " Need/Remark ")

                # PO / line
                po_number = pick(row, "PO#", "PO #", "PO No", "PO Number")
                lot_no = pick(row, "Lot#", "Lot #", "Lot No")
                qty_po = parse_int(pick(row, "Qty PO", "Qty", "Quantity"))
                price_each = clean_money(pick(row, " Price ", "Price", "Unit Price"))

                # dates
                due_original = parse_date(pick(row, "Original", "Due", "Due 1"))
                lot_due_date = (due_original - timedelta(days=60)) if due_original else None
                lot_start_date = (due_original - timedelta(days=30)) if due_original else None

                # Must have at least a part number to proceed
                if not part_no:
                    continue

                part = get_or_upsert_part(db, part_no=part_no, description=description, need_remark=need_remark)
                rev = get_or_upsert_revision(db, part, rev_code) if rev_code else None

                if po_number:
                    po = get_or_upsert_po(db, po_number, customer)
                    line = get_or_upsert_poline(
                        db=db,
                        po=po,
                        part=part,
                        rev=rev,
                        qty_ordered=Decimal(qty_po) if qty_po is not None else None,
                        unit_price=price_each,
                        due_date=due_original,
                    )
                    get_or_upsert_lot(
                        db=db,
                        lot_no=lot_no,
                        po_line=line,
                        planned_qty=Decimal(qty_po) if qty_po is not None else None,
                        lot_due=lot_due_date,
                        started_at=lot_start_date,
                    )
                processed += 1
                if processed % 500 == 0:
                    db.commit()

            db.commit()

    print(f"✅ Done. Processed {processed} rows from {CSV_FILE.name}")


if __name__ == "__main__":
    main()
