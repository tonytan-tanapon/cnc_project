#!/usr/bin/env python3
"""
CSV Customer Import / Upsert Script

Reads a CSV and upserts Customer records:
- Maps CSV 'Name' (or 'Customer', 'Customer Code') → Customer.code
- If not found, creates a new Customer
"""

import csv
from pathlib import Path
from typing import Optional, Dict
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session, sessionmaker
from datetime import date

# --- project import path ---
import sys, os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# --- your models ---
from models import Customer

# ------------------ CONFIG ------------------
DATABASE_URL = "postgresql+psycopg2://postgres:1234@localhost:5432/mydb"
CSV_FILE = Path(r"C:\Users\TPSERVER\dev\cnc_project\database_import\import_customer.csv")
CSV_ENCODING = "utf-8-sig"
CSV_DELIMITER = ","

DEFAULT_CUSTOMER_CODE = "CSV-IMPORT"
DEFAULT_CUSTOMER_NAME = "CSV Import (unknown customer)"

CUSTOMER_CODE_MAP: Dict[str, str] = {
    # "ABC": "CUSTOMER_ABC",
}
# -------------------------------------------

engine = create_engine(DATABASE_URL, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

# --- Helpers ---
def pick(d: dict, *keys: str) -> Optional[str]:
    """Return first non-empty string among given keys."""
    for k in keys:
        if k in d:
            v = d.get(k)
        else:
            cand = next((kk for kk in d.keys() if kk.strip() == k.strip()), None)
            v = d.get(cand) if cand else None
        if v is not None:
            s = str(v).strip()
            if s:
                return s
    return None

def fix_sequences(db: Session):
    """Repair customers.id sequence"""
    db.execute(text("""
        SELECT setval(
            pg_get_serial_sequence('customers', 'id'),
            COALESCE((SELECT MAX(id) FROM customers), 1) + 1,
            false
        );
    """))
    db.commit()

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

# --- Main ---
def main():
    with SessionLocal() as db:
        fix_sequences(db)

        with CSV_FILE.open("r", encoding=CSV_ENCODING, newline="") as f:
            reader = csv.DictReader(f, delimiter=CSV_DELIMITER)
            processed = 0

            for row in reader:
                customer_code = pick(row, "Name", "Customer", "Customer Code")
                get_or_upsert_customer(db, customer_code)
                processed += 1

                if processed % 500 == 0:
                    db.commit()

            db.commit()

    print(f"✅ Done. Processed {processed} rows (customers only) from {CSV_FILE.name}")

if __name__ == "__main__":
    main()
