#!/usr/bin/env python3
"""
CSV Customer Import / Upsert Script

Reads a CSV and upserts Customer records with full fields:
Code, Company, Address, City, State, Zipcode, Tel
"""

import csv
from pathlib import Path
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session, sessionmaker
from typing import Optional
from datetime import datetime
import sys, os

# --- project import path ---
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from models import  Customer
# ------------------ CONFIG ------------------
DATABASE_URL = "postgresql+psycopg2://postgres:1234@localhost:5432/mydb"
CSV_FILE = Path(r"C:\Users\TPSERVER\dev\cnc_project\database_import\import_customer.csv")
CSV_ENCODING = "utf-8-sig"
CSV_DELIMITER = ","
# -------------------------------------------

engine = create_engine(DATABASE_URL, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


# --- Helpers ---
def pick(d: dict, *keys: str) -> Optional[str]:
    """Return first non-empty string among given keys."""
    for k in keys:
        v = d.get(k) or d.get(k.strip()) or d.get(k.strip().title())
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


def get_or_upsert_customer(db: Session, row: dict, processed: int):
    # Normalize inputs
    code = (row.get("Code") or "").strip().upper()
    name = (row.get("Company") or "").strip() or "Unknown Company"

    # Build address
    address_parts = [
        row.get("Address"),
        row.get("City"),
        row.get("State"),
        row.get("Zipcode"),
    ]
    address = ", ".join([p.strip() for p in address_parts if p and str(p).strip()])
    phone = row.get("Tel.") or row.get("Tel")

    # 🔍 Search by code (preferred), else by name
    if code:
        cust = db.scalar(select(Customer).where(Customer.code == code))
    else:
        cust = db.scalar(select(Customer).where(Customer.name.ilike(name)))

    # 🔄 If found, update existing record
    if cust:
        updated = False
        if cust.name != name:
            cust.name = name
            updated = True
        if address and cust.address != address:
            cust.address = address
            updated = True
        if phone and cust.phone != phone:
            cust.phone = phone
            updated = True

        if updated:
            print(f"🔁 Updated existing customer: {cust.code or cust.name}")
            db.flush()

        return cust

    # ➕ Else create new one
    if not code:
        safe_name = (row.get("Company") or "UNKNOWN").replace(" ", "").replace(",", "")[:6].upper()
        timestamp = datetime.now().strftime("%H%M%S%f")[-6:]
        code = f"AUTO-{safe_name}-{timestamp}"

    cust = Customer(code=code, name=name, address=address, phone=phone)
    db.add(cust)
    print(f"➕ Inserted new customer: {code}")
    db.flush()
    return cust



# --- Main ---
def main():
    with SessionLocal() as db:
        fix_sequences(db)
        processed = 0

        with CSV_FILE.open("r", encoding=CSV_ENCODING, newline="") as f:
            reader = csv.DictReader(f, delimiter=CSV_DELIMITER)
            for row in reader:
                get_or_upsert_customer(db, row, processed)
                processed += 1

                if processed % 500 == 0:
                    db.commit()

            db.commit()

        print(f"✅ Done. Imported/Updated {processed} customers from {CSV_FILE.name}")


if __name__ == "__main__":
    main()
