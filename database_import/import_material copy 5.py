#!/usr/bin/env python3
"""
Import material purchase data from CSV

CSV = RECEIVING (increase stock)
Allocate LotMaterialUse ONLY when stock exists
"""

from __future__ import annotations
import csv
from decimal import Decimal
from datetime import datetime, date
from pathlib import Path
from zoneinfo import ZoneInfo
import sys, os

from sqlalchemy import create_engine, select, and_, func
from sqlalchemy.orm import Session, sessionmaker

# ---------- CONFIG ----------
LA_TZ = ZoneInfo("America/Los_Angeles")
DATABASE_URL = "postgresql+psycopg2://postgres:1234@localhost:5432/mydb"
CSV_FILE = Path(r"C:\Users\TPSERVER\dev\cnc_project\database_import\import_material.csv")
# CSV_FILE = Path(r"C:\Users\TPSERVER\dev\cnc_project\database_import\import_material_mini.csv")
# CSV_FILE = Path(r"C:\Users\TPSERVER\dev\cnc_project\database_import\import_material_all.csv")
CSV_ENCODING = "utf-8-sig"

# ---------- IMPORT MODELS ----------
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from models import (
    Supplier,
    MaterialPO,
    MaterialPOLine,
    RawMaterial,
    RawBatch,
    Part,
    PartMaterial,
    ProductionLot,
    LotMaterialUse,
)

# ---------- ENGINE ----------
engine = create_engine(DATABASE_URL, future=True)
SessionLocal = sessionmaker(bind=engine, class_=Session, autoflush=False, autocommit=False)


# =====================================================
# ================= HELPERS ===========================
# =====================================================

def normalize(s):
    return " ".join(str(s).strip().split()) if s else None


def parse_decimal(s):
    try:
        return Decimal(str(s).replace(",", "").replace("$", "").strip())
    except Exception:
        return None


def parse_date(s):
    if not s:
        return None
    for fmt in ("%m/%d/%y", "%m/%d/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s.strip(), fmt).date()
        except Exception:
            pass
    return None


# =====================================================
# ============= PO#, Qty PARSER =======================
# =====================================================

def parse_po_qty(raw_text):
    """
    Return list of {po, qty, note}
    """
    if not raw_text:
        return []

    records = []

    for line in raw_text.splitlines():
        line = line.strip().strip('"')
        if not line:
            continue

        # P123 & P456
        if "&" in line and "," not in line:
            for p in line.split("&"):
                records.append({"po": p.strip(), "qty": None, "note": "linked"})
            continue

        parts = [p.strip() for p in line.split(",")]
        po = parts[0]
        qty = None
        note = None

        if len(parts) >= 2:
            if parts[1].lower() == "partial":
                note = "partial"
            else:
                try:
                    qty = Decimal(parts[1])
                except Exception:
                    note = parts[1]

        if len(parts) > 2:
            note = ",".join(parts[2:])

        records.append({"po": po, "qty": qty, "note": note})

    return records


# =====================================================
# ================= UPSERTS ===========================
# =====================================================

def upsert_supplier(db, name):
    code = name.upper()
    s = db.scalar(select(Supplier).where(Supplier.code == code))
    if s:
        return s
    s = Supplier(code=code, name=name, is_material_supplier=True)
    db.add(s)
    db.flush()
    return s


def upsert_material_po(db, supplier, po_no, order_date):
    mpo = db.scalar(select(MaterialPO).where(MaterialPO.mat_po_no == po_no))
    if mpo:
        return mpo
    mpo = MaterialPO(
        mat_po_no=po_no,
        supplier_id=supplier.id,
        order_date=order_date or date.today(),
        status="open",
    )
    db.add(mpo)
    db.flush()
    return mpo


def upsert_raw_material(db, type_, spec, size, uom):
    code = " ".join(x for x in (type_, spec, size) if x).upper()
    rm = db.scalar(select(RawMaterial).where(RawMaterial.code == code))
    if rm:
        return rm
    
    rm = RawMaterial(code=code, name=code, type=type_, spec=spec, size_text=size, uom = uom)
    db.add(rm)
    db.flush()
    return rm


def upsert_material_po_line(db, mpo, part_no, rm, qty,size,length):
    line = db.scalar(
        select(MaterialPOLine).where(
            MaterialPOLine.po_id == mpo.id,
            MaterialPOLine.part_no == part_no,
            MaterialPOLine.material_id == rm.id,
        )
    )
    if line:
        return line

    line = MaterialPOLine(
        po_id=mpo.id,
        part_no=part_no,
        material_id=rm.id,
        qty_ordered=qty or Decimal(0),
        size = size,
        length_text = length
    )
    db.add(line)
    db.flush()
    return line


# =====================================================
# ============== RAW BATCH (RECEIVING) ================
# =====================================================

def upsert_raw_batch(db, batch_no,rm, mpo, line, heat_no, length_text, weight):
    #batch_no = heat_no or f"HT-{rm.id}-{mpo.id}"

    rb = db.scalar(
        select(RawBatch).where(
            RawBatch.material_id == rm.id,
            RawBatch.batch_no == batch_no,
        )
    )

    if rb:
        if weight:
            rb.qty_received = (rb.qty_received or Decimal(0)) + weight
            rb.weight = (rb.weight or Decimal(0)) + weight

        if length_text:
            rb.length_text = length_text

        db.flush()
        return rb

    rb = RawBatch(
        material_id=rm.id,
        po_id=mpo.id,
        material_po_line_id=line.id,
        batch_no=batch_no,
        mill_heat_no=heat_no,
        length_text=length_text,
        weight=weight,
        qty_received=weight or Decimal(0),
    )
    db.add(rb)
    db.flush()
    return rb


def upsert_part_material(db, part_id, raw_material_id):
    pm = db.scalar(
        select(PartMaterial).where(
            PartMaterial.part_id == part_id,
            PartMaterial.raw_material_id == raw_material_id,
        )
    )
    if pm:
        return pm

    pm = PartMaterial(part_id=part_id, raw_material_id=raw_material_id)
    db.add(pm)
    db.flush()
    return pm


# =====================================================
# ============ LOT MATERIAL USE =======================
# =====================================================

def get_lot_by_po(db, po_no):
    return db.scalar(
        select(ProductionLot)
        .join(ProductionLot.po)
        .where(ProductionLot.po.has(po_number=po_no))
        .order_by(ProductionLot.created_at.desc())
    )


def get_remaining_batch_qty(db, rb):
    used = db.scalar(
        select(func.coalesce(func.sum(LotMaterialUse.qty), 0))
        .where(LotMaterialUse.batch_id == rb.id)
    )
    return (rb.qty_received or Decimal(0)) - used


def insert_lot_material_use(db, lot, rb, qty, note=None):
    
    remaining = get_remaining_batch_qty(db, rb)
    # print(remaining)
    if remaining <= 0:
        return None

    use_qty = min(qty, remaining)

    lmu = LotMaterialUse(
        lot_id=lot.id,
        batch_id=rb.id,
        raw_material_id=rb.material_id,
        qty=use_qty,
        qty_uom="pcs",
        note=note,
    )
    db.add(lmu)
    db.flush()
    return lmu


# =====================================================
# =================== MAIN ============================
# =====================================================

def main():
    with SessionLocal() as db:
        with open(CSV_FILE, encoding=CSV_ENCODING, newline="", errors="ignore") as f:
            reader = csv.DictReader(f)
            count = 0

            for row in reader:
                company = normalize(row.get("Company"))
                vendor_po = normalize(row.get("Vendor PO"))
          
                part_no = normalize(row.get("Part no."))
                size = row.get("Size")
                lenght = row.get("Length")

                if not company or not vendor_po:
                    continue
                
                ## 1. suppliers Table
                supplier = upsert_supplier(db, company)

                

                # 2. raw material
                rm = upsert_raw_material(
                    db,
                    normalize(row.get("Type")),
                    normalize(row.get("Spec.") or row.get("Spec")),
                    normalize(row.get("Size")),
                    'foot'
                )

                # Materail PO
                mpo = upsert_material_po(db, supplier, vendor_po, parse_date(row.get("Date")))
                po_items = parse_po_qty(row.get("PO#, Qty"))

                
               
                

                

                # ---------- SAFE ALLOCATION ----------
                i=0
                if part_no:
                    part = db.scalar(select(Part).where(Part.part_no == part_no))
                    if part:
                        upsert_part_material(db, part.id, rm.id)
                if part_no:
                    pp_no = part_no.split(" ")
                else:
                    pp_no = []
                
                n= len(pp_no)
                for it in po_items:
                   
                    if not it["qty"]:
                        continue

                    
                    # print(pp_no,it["qty"])
                    i+=1
                    if i<n and pp_no[i] :
                        part = db.scalar(select(Part).where(Part.part_no == pp_no[i]))
                        if part:
                            upsert_part_material(db, part.id, rm.id)
                        # Mat po line
                        line = upsert_material_po_line(
                            db,
                            mpo,
                            part_no,
                            rm,
                            it["qty"],
                            size,
                            lenght,
                        )

                        # recive MAT
                        rb = upsert_raw_batch(
                            db,
                            vendor_po,
                            rm,
                            mpo,
                            line,
                            normalize(row.get("Heat lot")),
                            normalize(row.get("Length")),
                            parse_decimal(it["qty"]),
                        )
                        lot = get_lot_by_po(db, it["po"])

                        # print(lot, lot.id,it["qty"])
                        if not lot:
                            # print(f"❌ LOT NOT FOUND for PO {it['po']}")
                            continue
                        # ## Allocate MAT    
                        insert_lot_material_use(
                            db,
                            lot=lot,
                            rb=rb,
                            qty=it["qty"],
                            note=it["note"],
                        )

                count += 1
                if count % 50 == 0:
                    db.commit()
                    print(f"✅ {count} rows processed")

            db.commit()
            print(f"🎉 DONE: {count} rows imported")


if __name__ == "__main__":
    main()
