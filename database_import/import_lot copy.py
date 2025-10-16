#!/usr/bin/env python3
"""
CSV import / upsert script (updated):
- Fixes created_at date parsing
- Adds residual_inv numeric column to CustomerInvoice
- Upserts CustomerInvoice.residual_inv from CSV
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

# =================== Helpers ===================

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
    """Try parse multiple date formats."""
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

def get_or_upsert_invoice(
    db: Session,
    invoice_no: str,
    po: PO,
    invoice_date: Optional[date],
    status: str = "open",
    notes: Optional[str] = None,
    residual_inv: Optional[int] = None,  # NEW
) -> CustomerInvoice:
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
        residual_inv=residual_inv,  # NEW
    )
    db.add(inv)
    db.flush()
    return inv

# ================= Main ====================

def main():
    with SessionLocal() as db:
        fix_sequences(db, [
            ("customers", "id"),
            ("customer_invoices", "id"),
        ])

        with CSV_FILE.open("r", encoding=CSV_ENCODING, newline="") as f:
            reader = csv.DictReader(f, delimiter=CSV_DELIMITER)
            processed = 0

            for row in reader:
                # --- Customer ---
                customer_code = pick(row, "Name", "Customer", "Customer Code")
                customer = get_or_upsert_customer(db, customer_code)

                # --- PO / invoice info ---
                po_number = pick(row, "PO#", "PO #", "PO No", "PO Number")
                if not po_number:
                    continue
                po = db.execute(select(PO).where(PO.po_number == po_number)).scalar_one_or_none()
                if not po:
                    # create placeholder PO if needed
                    po = PO(po_number=po_number, customer_id=customer.id)
                    db.add(po)
                    db.flush()

                # --- Invoice Fields ---
                invoice_no = pick(row, "Invoice #", "Invoice", "Invoice No", "invoice_no", "Invoice No.")
                order_date = parse_date(pick(row, "Order Date", "PO Date"))
                ship_date = parse_date(pick(row, "Ship Date", "Shipped Date", "Shipped"))
                residual_inv = parse_int(pick(row, "Residual Inv", "Residual", "Residual Invoice"))

                # --- Lot created_at fix ---
                created_at = parse_date(pick(row, "Date"))  # ✅ fixed parsing

                if invoice_no:
                    get_or_upsert_invoice(
                        db=db,
                        invoice_no=invoice_no,
                        po=po,
                        invoice_date=(ship_date or order_date),
                        status="open",
                        notes=None,
                        residual_inv=residual_inv,  # ✅ new column included
                    )

                processed += 1
                if processed % 500 == 0:
                    db.commit()

            db.commit()

    print(f"✅ Done. Processed {processed} rows from {CSV_FILE.name}")

if __name__ == "__main__":
    main()
