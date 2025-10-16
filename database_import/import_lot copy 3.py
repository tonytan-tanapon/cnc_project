#!/usr/bin/env python3
"""
CSV import / upsert script:
- Upserts Customer, Part, PartRevision, PO, POLine, ProductionLot
- Fix: created_at & started_at saved as local midnight (no timezone shift)
- NEW: residual_inv column added to CustomerInvoice (integer)
- Upserts residual_inv from CSV column 'Residual Inv'
- Restores original POLine uniqueness logic (no MultipleResultsFound)
"""

from __future__ import annotations
import csv
from decimal import Decimal
from pathlib import Path
from typing import Optional, Iterable, Dict, Tuple
from datetime import datetime, date, time, timedelta, timezone
from sqlalchemy import create_engine, select, text, and_
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
    CustomerShipment,
    CustomerShipmentItem,
    CustomerInvoice,
    CustomerInvoiceLine,
)

# ------------------ CONFIG ------------------
DATABASE_URL = "postgresql+psycopg2://postgres:1234@localhost:5432/mydb"
CSV_FILE = Path(r"C:\Users\TPSERVER\dev\cnc_project\database_import\import_lot.csv")
CSV_ENCODING = "utf-8-sig"
CSV_DELIMITER = ","

DEFAULT_CUSTOMER_CODE = "CSV-IMPORT"
DEFAULT_CUSTOMER_NAME = "CSV Import (unknown customer)"

CUSTOMER_CODE_MAP: Dict[str, str] = {}
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
        f = float(txt)
        return int(round(f))
    except Exception:
        return None

def parse_date(s: Optional[str]) -> Optional[date]:
    """Try parse dates like MM/DD/YY, MM/DD/YYYY, YYYY-MM-DD, etc."""
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
    if not d:
        return None
    return datetime.combine(d, time.min, tzinfo=timezone.utc)

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

def seconds_since(ts: Optional[datetime]) -> Optional[float]:
    if ts is None:
        return None
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    else:
        ts = ts.astimezone(timezone.utc)
    return (utc_now() - ts).total_seconds()

# =============== Sequence Repair ===============

def fix_sequences(db: Session, table_cols: Iterable[Tuple[str, str]]):
    """Ensure each table's id sequence is > max(id)."""
    for table_name, id_col in table_cols:
        db.execute(text(f"""
            SELECT setval(
                pg_get_serial_sequence(:tname, :idcol),
                COALESCE((SELECT MAX({id_col}) FROM {table_name}), 1) + 1,
                false
            )
        """), {"tname": table_name, "idcol": id_col})
    db.commit()

# =============== UPSERT FUNCTIONS ===============

def get_or_upsert_customer(db: Session, raw_name_or_code: Optional[str]) -> Customer:
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

def get_or_upsert_lot(
    db: Session,
    lot_no: Optional[str],
    po_line: POLine,
    planned_qty: Optional[Decimal],
    lot_due: Optional[date],
    started_at: Optional[date],
    note_text: Optional[str] = None,
    fair_note: Optional[str] = None,
    created_at: Optional[date] = None,
) -> Optional[ProductionLot]:
    """Upsert ProductionLot (created_at & started_at saved as local midnight)."""
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
            # Keep lot_due_date as a date (safest)—do not convert to datetime here
            lot_due_date=lot_due,
            # Save local midnight (no tz) so it won't shift when viewed
            started_at=(datetime.combine(started_at, time.min) if started_at else None),
            created_at=(datetime.combine(created_at, time.min) if created_at else None),
            status="in_process",
            note=(note_text.strip() if note_text else None),
            fair_note=(fair_note.strip() if fair_note else None),
        )
        db.add(lot)
        db.flush()
        return lot

    changed = False

    # Check and update started_at (local midnight)
    new_started_dt = (datetime.combine(started_at, time.min) if started_at else None)
    if (lot.started_at or None) != (new_started_dt or None):
        lot.started_at = new_started_dt
        changed = True

    # Check and update created_at (local midnight)
    new_created_dt = (datetime.combine(created_at, time.min) if created_at else None)
    if (lot.created_at or None) != (new_created_dt or None):
        lot.created_at = new_created_dt
        changed = True

    # Keep lot_due_date as date (no timezone issues)
    if (lot.lot_due_date or None) != (lot_due or None):
        lot.lot_due_date = lot_due
        changed = True

    # Keep relationships in sync (unchanged from your logic)
    if lot.po_line_id != po_line.id:
        lot.po_line_id = po_line.id; changed = True
    if lot.part_id != po_line.part_id:
        lot.part_id = po_line.part_id; changed = True
    if lot.part_revision_id != po_line.revision_id:
        lot.part_revision_id = po_line.revision_id; changed = True

    pq = int(planned_qty) if planned_qty is not None else lot.planned_qty
    if pq != lot.planned_qty:
        lot.planned_qty = pq; changed = True

    if note_text is not None:
        new_note = note_text.strip()
        if (lot.note or "").strip() != new_note:
            lot.note = new_note; changed = True

    if fair_note is not None:
        new_fair = fair_note.strip()
        if (lot.fair_note or "").strip() != new_fair:
            lot.fair_note = new_fair; changed = True

    if changed:
        db.flush()
    return lot

def get_or_upsert_invoice(
    db: Session,
    invoice_no: str,
    po: PO,
    invoice_date: Optional[date],
    status: str = "open",
    notes: Optional[str] = None,
    residual_inv: Optional[int] = None,  # NEW FIELD
) -> CustomerInvoice:
    """Upsert CustomerInvoice including residual_inv."""
    q = select(CustomerInvoice).where(CustomerInvoice.invoice_no == invoice_no)
    inv = db.execute(q).scalar_one_or_none()
    if inv:
        changed = False
        if inv.po_id != po.id:
            inv.po_id = po.id; changed = True
        if invoice_date is not None:
            inv.invoice_date = to_utc_midnight(invoice_date); changed = True
        if notes is not None and inv.notes != notes:
            inv.notes = notes; changed = True
        if status and inv.status != status:
            inv.status = status; changed = True
        if residual_inv is not None and getattr(inv, "residual_inv", None) != residual_inv:
            inv.residual_inv = residual_inv; changed = True
        if changed:
            db.flush()
        return inv

    inv = CustomerInvoice(
        invoice_no=invoice_no,
        po_id=po.id,
        invoice_date=to_utc_midnight(invoice_date) if invoice_date else None,
        status=status,
        notes=notes,
        residual_inv=residual_inv,  # included
    )
    db.add(inv)
    db.flush()
    return inv

# ================= Main ====================

def main():
    with SessionLocal() as db:
        fix_sequences(db, [
            ("customers", "id"),
            ("parts", "id"),
            ("part_revisions", "id"),
            ("purchase_orders", "id"),
            ("po_lines", "id"),
            ("production_lots", "id"),
            ("customer_invoices", "id"),
        ])

        with CSV_FILE.open("r", encoding=CSV_ENCODING, newline="") as f:
            reader = csv.DictReader(f, delimiter=CSV_DELIMITER)
            processed = 0

            for row in reader:
                customer_code = pick(row, "Name", "Customer", "Customer Code")
                customer = get_or_upsert_customer(db, customer_code)

                part_no = pick(row, "Part No.", "Part No")
                description = pick(row, "Description")
                rev_code = pick(row, "Rev.", "Rev")
                need_remark = pick(row, "Need/Remark", " Need/Remark ")
                fair_no = pick(row, "FAIR#", "FAIR No", "FAIR")
                po_number = pick(row, "PO#", "PO #", "PO No", "PO Number")
                lot_no = pick(row, "Lot#", "Lot #", "Lot No")
                qty_po = parse_int(pick(row, "Qty PO", "Qty", "Quantity"))
                price_each = clean_money(pick(row, " Price ", "Price", "Unit Price"))
                due_original = parse_date(pick(row, "Original", "Due", "Due 1"))
                lot_due_date = (due_original - timedelta(days=60)) if due_original else None
                lot_start_date = (due_original - timedelta(days=30)) if due_original else None
                created_at = parse_date(pick(row, "Date"))  # parsed date
                residual_inv = parse_int(pick(row, "Residual Inv", "Residual", "Residual Invoice"))  # new field

                ship_date = parse_date(pick(row, "Ship Date", "Shipped Date", "Shipped"))
                qty_shipped = parse_int(pick(row, "Qty Shipped", "Shipped Qty", "Qty Ship"))
                invoice_no = pick(row, "Invoice #", "Invoice", "Invoice No", "invoice_no", "Invoice No.")
                order_date = parse_date(pick(row, "Order Date", "PO Date"))

                if not part_no:
                    continue

                # --- Part ---
                part = db.execute(select(Part).where(Part.part_no == part_no)).scalar_one_or_none()
                if not part:
                    part = Part(part_no=part_no, name=(description or part_no))
                    db.add(part)
                    db.flush()

                # --- Revision ---
                rev = None
                if rev_code:
                    rev = db.execute(select(PartRevision).where(
                        PartRevision.part_id == part.id, PartRevision.rev == rev_code
                    )).scalar_one_or_none()
                    if not rev:
                        rev = PartRevision(part_id=part.id, rev=rev_code, is_current=False)
                        db.add(rev)
                        db.flush()

                # --- PO / POLine ---
                if po_number:
                    po = db.execute(select(PO).where(PO.po_number == po_number)).scalar_one_or_none()
                    if not po:
                        po = PO(po_number=po_number, customer_id=customer.id)
                        db.add(po)
                        db.flush()

                    # POLine uniqueness uses UTC midnight (matches your original logic)
                    target_due_dt = to_utc_midnight(due_original) if due_original else None
                    line = db.execute(
                        select(POLine)
                        .where(
                            POLine.po_id == po.id,
                            POLine.part_id == part.id,
                            POLine.revision_id == (rev.id if rev else None),
                            POLine.due_date == target_due_dt,
                        )
                    ).scalar_one_or_none()
                    if not line:
                        line = POLine(
                            po_id=po.id,
                            part_id=part.id,
                            revision_id=(rev.id if rev else None),
                            qty_ordered=Decimal(qty_po or 0),
                            unit_price=price_each,
                            due_date=target_due_dt,
                        )
                        db.add(line)
                        db.flush()

                    # --- Production Lot ---
                    get_or_upsert_lot(
                        db=db,
                        lot_no=lot_no,
                        po_line=line,
                        planned_qty=Decimal(qty_po or 0),
                        lot_due=lot_due_date,         # keep as date
                        started_at=lot_start_date,    # will be saved as local midnight
                        note_text=need_remark,
                        fair_note=fair_no,
                        created_at=created_at,        # will be saved as local midnight
                    )

                    # --- Invoice ---
                    if invoice_no:
                        get_or_upsert_invoice(
                            db=db,
                            invoice_no=invoice_no,
                            po=po,
                            invoice_date=(ship_date or order_date),
                            status="open",
                            notes=None,
                            residual_inv=residual_inv,
                        )

                processed += 1
                if processed % 500 == 0:
                    db.commit()

            db.commit()

    print(f"✅ Done. Processed {processed} rows from {CSV_FILE.name}")


if __name__ == "__main__":
    main()
