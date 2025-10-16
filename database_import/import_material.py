#!/usr/bin/env python3
"""
Import material purchase data from CSV into PostgreSQL (Upsert Version A)
Structure:
  Supplier ──< MaterialPO ──< MaterialPOLine ──< RawBatch
                                          ↘
                                           Part (part_no)
  RawMaterial ──< RawBatch
"""

from __future__ import annotations
import csv
from decimal import Decimal
from datetime import datetime, date
from pathlib import Path
from sqlalchemy import create_engine, select, and_
from sqlalchemy.orm import Session, sessionmaker
import sys, os
from zoneinfo import ZoneInfo

# ---------- CONFIG ----------
LA_TZ = ZoneInfo("America/Los_Angeles")
DATABASE_URL = "postgresql+psycopg2://postgres:1234@localhost:5432/mydb"
CSV_FILE = Path(r"C:\Users\TPSERVER\dev\cnc_project\database_import\import_material.csv")
CSV_ENCODING = "utf-8-sig"
CSV_DELIMITER = ","

# ---------- PROJECT IMPORTS ----------
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from models import Supplier, MaterialPO, MaterialPOLine, RawMaterial, RawBatch

# ---------- ENGINE ----------
engine = create_engine(DATABASE_URL, future=True)
SessionLocal = sessionmaker(bind=engine, class_=Session, autoflush=False, autocommit=False, future=True)


# ---------- HELPERS ----------
def parse_date(s: str | None) -> date | None:
    """Parse date string and return LA-local date."""
    if not s:
        return None
    s = s.strip()
    for fmt in ("%m/%d/%y", "%m/%d/%Y", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            dt = datetime.strptime(s, fmt).replace(tzinfo=LA_TZ)
            return dt.date()
        except Exception:
            continue
    return None


def parse_decimal(s: str | None) -> Decimal | None:
    """Convert string to Decimal safely (removing $, commas, spaces)."""
    if not s:
        return None
    try:
        return Decimal(str(s).replace(",", "").replace("$", "").strip())
    except Exception:
        return None


def normalize(s: str | None) -> str | None:
    """Trim spaces and normalize whitespace."""
    if not s:
        return None
    return " ".join(str(s).strip().split())


# ---------- UPSERT HELPERS ----------
def upsert_supplier(db: Session, name: str) -> Supplier:
    code = (name or "").strip().upper()
    supplier = db.scalar(select(Supplier).where(Supplier.code == code))
    if supplier:
        if name and supplier.name != name:
            supplier.name = name
            db.flush()
        return supplier
    supplier = Supplier(code=code, name=name or code, is_material_supplier=True)
    db.add(supplier)
    db.flush()
    return supplier


def upsert_material_po(db: Session, supplier: Supplier, mat_po_no: str, order_date: date) -> MaterialPO:
    mpo = db.scalar(select(MaterialPO).where(MaterialPO.mat_po_no == mat_po_no))
    if mpo:
        updated = False
        if mpo.supplier_id != supplier.id:
            mpo.supplier_id = supplier.id
            updated = True
        if order_date and mpo.order_date != order_date:
            mpo.order_date = order_date
            updated = True
        if updated:
            db.flush()
        return mpo
    mpo = MaterialPO(
        mat_po_no=mat_po_no,
        supplier_id=supplier.id,
        order_date=order_date or datetime.now(LA_TZ).date(),
        status="open",
    )
    db.add(mpo)
    db.flush()
    return mpo


def upsert_raw_material(db: Session, type_: str, spec: str, size: str) -> RawMaterial:
    """Use (type, spec, size) as unique key."""
    code_parts = [x for x in (type_, spec, size) if x]
    code = " ".join(code_parts).upper() if code_parts else "UNKNOWN"
    rm = db.scalar(select(RawMaterial).where(RawMaterial.code == code))
    if rm:
        updated = False
        if type_ and rm.type != type_:
            rm.type = type_
            updated = True
        if spec and rm.spec != spec:
            rm.spec = spec
            updated = True
        if size and (not getattr(rm, "size_text", None) or rm.size_text != size.strip()):
            rm.size_text = size.strip()
            updated = True
        if updated:
            db.flush()
        return rm
    rm = RawMaterial(code=code, name=code, type=type_, spec=spec, size_text=size)
    db.add(rm)
    db.flush()
    return rm


def upsert_material_po_line(
    db: Session, mpo: MaterialPO, part_no: str | None, rm: RawMaterial,
    qty: Decimal | None, price: Decimal | None, total: Decimal | None, cut_charge: Decimal | None
) -> MaterialPOLine:
    line = db.scalar(
        select(MaterialPOLine).where(
            and_(
                MaterialPOLine.po_id == mpo.id,
                MaterialPOLine.part_no == part_no,
                MaterialPOLine.material_id == rm.id,
            )
        )
    )
    if line:
        updated = False
        if qty and line.qty_ordered != qty:
            line.qty_ordered = qty
            updated = True
        if price and line.price_each != price:
            line.price_each = price
            updated = True
        if total and line.total_price != total:
            line.total_price = total
            updated = True
        if cut_charge and line.cut_charge != cut_charge:
            line.cut_charge = cut_charge
            updated = True
        if updated:
            db.flush()
        return line

    line = MaterialPOLine(
        po_id=mpo.id,
        part_no=part_no,
        material_id=rm.id,
        qty_ordered=qty or Decimal(0),
        price_each=price,
        total_price=total,
        cut_charge=cut_charge,
    )
    db.add(line)
    db.flush()
    return line


def upsert_raw_batch(
    db: Session,
    rm: RawMaterial,
    mpo: MaterialPO,
    line: MaterialPOLine,
    heat_no: str,
    cert: str,
    length_text: str,
    weight: Decimal | None,
) -> RawBatch:
    """Each Heat lot = 1 unique batch per RawMaterial."""
    batch_no = heat_no or f"HT-{rm.id}-{mpo.id}"

    
    rb = db.scalar(
        select(RawBatch).where(
            and_(RawBatch.material_id == rm.id, RawBatch.batch_no == batch_no)
        )
    )
    if rb:
        updated = False
        if cert and rb.cert_file != cert:
            rb.cert_file = cert
            updated = True
        if weight and rb.weight != weight:
            rb.weight = weight
            updated = True
        if length_text and rb.length_text != length_text:
            rb.length_text = length_text
            updated = True
       
        if updated:
            db.flush()
        return rb
    
    rb = RawBatch(
        material_id=rm.id,
        po_id=mpo.id,
        material_po_line_id=line.id,
        batch_no=batch_no,
        mill_heat_no=heat_no,
        cert_file=cert,
        length_text=length_text,
        weight=weight,
        qty_received=weight or Decimal(0),
        heat_lot = heat_no, 
    )
    db.add(rb)
    db.flush()
    return rb


# ---------- MAIN ----------
def main():
    with SessionLocal() as db:
        with open(CSV_FILE, "r", encoding=CSV_ENCODING, newline="") as f:
            reader = csv.DictReader(f, delimiter=CSV_DELIMITER)
            processed = 0

            for row in reader:
                order_date = parse_date(row.get("Date"))
                vendor_po = normalize(row.get("Vendor PO"))
                company = normalize(row.get("Company"))
                type_ = normalize(row.get("Type"))
                spec = normalize(row.get("Spec.") or row.get("Spec"))
                size = normalize(row.get("Size"))
                length_text = normalize(row.get("Length"))
                heat_no = normalize(row.get("Heat lot"))
                cert = normalize(row.get("Material Cert"))
                part_no = normalize(row.get("Part no."))
                qty = parse_decimal(row.get("Qty"))
                weight = parse_decimal(row.get("Weight"))
                price = parse_decimal(row.get("Price"))
                cut_charge = parse_decimal(row.get("Cut Charge"))
                total = parse_decimal(row.get("Total"))

                if not vendor_po or not company:
                    continue

                supplier = upsert_supplier(db, company)
                mpo = upsert_material_po(db, supplier, vendor_po, order_date)
                rm = upsert_raw_material(db, type_, spec, size)
                line = upsert_material_po_line(db, mpo, part_no, rm, qty, price, total, cut_charge)
                upsert_raw_batch(db, rm, mpo, line, heat_no, cert, length_text, weight)

                processed += 1
                if processed % 50 == 0:
                    db.commit()
                    print(f"✅ Processed {processed} rows...")

            db.commit()
            print(f"🎉 Import complete: {processed} rows processed.")


if __name__ == "__main__":
    main()
