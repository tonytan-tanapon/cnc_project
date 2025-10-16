#!/usr/bin/env python3
"""
CSV import / upsert script (updated for CNC schema 2025):
- Upserts Customer, Part, PartRevision, PO, POLine, ProductionLot, CustomerInvoice
- Saves created_at & started_at as local midnight (avoid timezone drift)
- Supports new DB schema with explicit Part foreign keys
- Retains 'residual_inv' support for invoices
- Auto-generates Lot Number if missing in CSV (AUTO-YYYYMMDD-####)
"""

from __future__ import annotations
import csv, sys, os
from decimal import Decimal
from pathlib import Path
from typing import Optional, Iterable, Dict, Tuple
from datetime import datetime, date, time, timedelta, timezone
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session, sessionmaker

# ---------- Path setup ----------
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# ---------- Import models ----------
from models import (
    Customer,
    Part,
    PartRevision,
    PO,
    POLine,
    ProductionLot,
    CustomerInvoice,
)

# ---------- CONFIG ----------
DATABASE_URL = "postgresql+psycopg2://postgres:1234@localhost:5432/mydb"
CSV_FILE = Path(r"C:\Users\TPSERVER\dev\cnc_project\database_import\import_lot.csv")
CSV_ENCODING = "utf-8-sig"
CSV_DELIMITER = ","

DEFAULT_CUSTOMER_CODE = "CSV-IMPORT"
DEFAULT_CUSTOMER_NAME = "CSV Import (unknown customer)"

CUSTOMER_CODE_MAP: Dict[str, str] = {}

engine = create_engine(DATABASE_URL, future=True)
SessionLocal = sessionmaker(bind=engine, class_=Session, autoflush=False, autocommit=False, future=True)

# ---------- Helper functions ----------

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

# ---------- Sequence fix ----------
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

# ---------- UPSERT logic ----------

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
    lot_no: str,
    po_line: POLine,
    qty: Optional[Decimal],
    lot_due_date: Optional[date],
    start_date: Optional[date],
    created_date: Optional[date],
    note: Optional[str],
    fair_note: Optional[str],
):
    lot = db.execute(select(ProductionLot).where(ProductionLot.lot_no == lot_no)).scalar_one_or_none()
    if not lot:
        lot = ProductionLot(
            lot_no=lot_no,
            part_id=po_line.part_id,
            part_revision_id=po_line.revision_id,
            po_id=po_line.po_id,
            po_line_id=po_line.id,
            planned_qty=int(qty or 0),
            lot_due_date=lot_due_date,
            started_at=(datetime.combine(start_date, time.min) if start_date else None),
            created_at=(datetime.combine(created_date, time.min) if created_date else None),
            status="in_process",
            note=(note.strip() if note else None),
            fair_note=(fair_note.strip() if fair_note else None),
        )
        db.add(lot)
        db.flush()
    else:
        changed = False
        if lot.part_id != po_line.part_id:
            lot.part_id = po_line.part_id; changed = True
        if lot.part_revision_id != po_line.revision_id:
            lot.part_revision_id = po_line.revision_id; changed = True
        if lot.po_line_id != po_line.id:
            lot.po_line_id = po_line.id; changed = True
        if qty and int(qty) != lot.planned_qty:
            lot.planned_qty = int(qty); changed = True
        if lot.lot_due_date != lot_due_date:
            lot.lot_due_date = lot_due_date; changed = True
        if changed:
            db.flush()
    return lot

def get_or_upsert_invoice(
    db: Session,
    invoice_no: str,
    po: PO,
    invoice_date: Optional[date],
    residual_inv: Optional[int],
):
    inv = db.execute(select(CustomerInvoice).where(CustomerInvoice.invoice_no == invoice_no)).scalar_one_or_none()
    if not inv:
        inv = CustomerInvoice(
            invoice_no=invoice_no,
            po_id=po.id,
            invoice_date=invoice_date,
            residual_inv=residual_inv,
            status="open",
        )
        db.add(inv)
        db.flush()
    else:
        changed = False
        if inv.po_id != po.id:
            inv.po_id = po.id; changed = True
        if inv.residual_inv != residual_inv:
            inv.residual_inv = residual_inv; changed = True
        if changed:
            db.flush()
    return inv

# ---------- MAIN ----------
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
                customer = get_or_upsert_customer(db, pick(row, "Customer", "Customer Name", "Name"))
                part_no = pick(row, "Part No.", "Part No")
                if not part_no:
                    continue

                part_desc = pick(row, "Description")
                rev_code = pick(row, "Rev.", "Rev")
                po_number = pick(row, "PO#", "PO Number")
                lot_no = pick(row, "Lot#", "Lot #", "Lot No", "Lot Number", "LOT NO.")
                qty_po = parse_int(pick(row, "Qty PO", "Qty", "Quantity"))
                price_each = clean_money(pick(row, "Price", "Unit Price"))
                due_date = parse_date(pick(row, "Due Date", "Original"))
                created_at = parse_date(pick(row, "Date"))
                need_remark = pick(row, "Need/Remark", "Remark")
                fair_no = pick(row, "FAIR#", "FAIR No")
                invoice_no = pick(row, "Invoice#", "Invoice No")
                residual_inv = parse_int(pick(row, "Residual Inv", "Residual Invoice"))
                ship_date = parse_date(pick(row, "Ship Date", "Shipped Date"))

                # --- Auto-generate Lot No if missing ---
                if not lot_no:
                    today = datetime.now().strftime("%Y%m%d")
                    lot_no = f"AUTO-{today}-{processed+1:04d}"

                # --- Part ---
                part = db.execute(select(Part).where(Part.part_no == part_no)).scalar_one_or_none()
                if not part:
                    part = Part(part_no=part_no, name=(part_desc or part_no))
                    db.add(part)
                    db.flush()

                # --- Revision ---
                rev = None
                if rev_code:
                    rev = db.scalar(select(PartRevision).where(
                        PartRevision.part_id == part.id, PartRevision.rev == rev_code
                    ))
                    if not rev:
                        rev = PartRevision(part_id=part.id, rev=rev_code, is_current=False)
                        db.add(rev)
                        db.flush()

                # --- PO / POLine ---
                if not po_number:
                    continue
                po = db.scalar(select(PO).where(PO.po_number == po_number))
                if not po:
                    po = PO(po_number=po_number, customer_id=customer.id)
                    db.add(po)
                    db.flush()

                line = db.scalar(select(POLine).where(
                    POLine.po_id == po.id,
                    POLine.part_id == part.id,
                    POLine.revision_id == (rev.id if rev else None),
                ))
                if not line:
                    line = POLine(
                        po_id=po.id,
                        part_id=part.id,
                        revision_id=(rev.id if rev else None),
                        qty_ordered=Decimal(qty_po or 0),
                        unit_price=price_each,
                        due_date=(to_utc_midnight(due_date) if due_date else None),
                    )
                    db.add(line)
                    db.flush()

                # --- Lot ---
                get_or_upsert_lot(
                    db=db,
                    lot_no=lot_no,
                    po_line=line,
                    qty=Decimal(qty_po or 0),
                    lot_due_date=due_date,
                    start_date=(due_date - timedelta(days=30)) if due_date else None,
                    created_date=created_at,
                    note=need_remark,
                    fair_note=fair_no,
                )

                # --- Invoice ---
                if invoice_no:
                    get_or_upsert_invoice(
                        db, invoice_no, po,
                        invoice_date=ship_date or due_date,
                        residual_inv=residual_inv,
                    )

                processed += 1
                if processed % 200 == 0:
                    db.commit()

            db.commit()
    print(f"✅ Done. Processed {processed} rows from {CSV_FILE.name}")

if __name__ == "__main__":
    main()
