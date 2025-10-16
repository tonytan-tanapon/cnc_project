#!/usr/bin/env python3
"""
Unified CSV import / upsert script

- Keeps your customer/part/PO/lot/shipment/invoice logic (unchanged from prior edit).
- Adds/adjusts MATERIAL import with the exact mappings you requested.

Material CSV columns used (any others are ignored safely):
Date,Part no.,Vendor PO,On time/Quality,Cutting Receiving/HT,Material Cert,"PO#, Qty",Company,Type,Spec.,Heat lot,Size,Length,Weight, Price , Cut Charge , Total
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
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# --- models ---
from models import (
    # customer-side
    Customer, Part, PartRevision, PO, POLine, ProductionLot,
    CustomerShipment, CustomerShipmentItem, CustomerInvoice, CustomerInvoiceLine,
    # material-side
    Supplier, RawMaterial, MaterialPO, MaterialPOLine, RawBatch,
)

# ------------------ CONFIG ------------------
DATABASE_URL = "postgresql+psycopg2://postgres:1234@localhost:5432/mydb"
CSV_FILE = Path(r"C:\Users\TPSERVER\dev\cnc_project\database_import\import_material.csv")
CSV_ENCODING = "utf-8-sig"
CSV_DELIMITER = ","

DEFAULT_CUSTOMER_CODE = "CSV-IMPORT"
DEFAULT_CUSTOMER_NAME = "CSV Import (unknown customer)"
CUSTOMER_CODE_MAP: Dict[str, str] = {}

engine = create_engine(DATABASE_URL, future=True)
SessionLocal = sessionmaker(bind=engine, class_=Session, autoflush=False, autocommit=False, future=True)

# ------------- helpers -------------

def pick(d: dict, *keys: str) -> Optional[str]:
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
    t = str(s).replace(",", "").replace("$", "").replace(" ", "").strip()
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
        f = float(txt); i = int(round(f)); return i
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

def seconds_since(ts: Optional[datetime]) -> Optional[float]:
    if ts is None:
        return None
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    else:
        ts = ts.astimezone(timezone.utc)
    return (datetime.now(timezone.utc) - ts).total_seconds()

def parse_po_qty_field(s: Optional[str]) -> Tuple[Optional[str], Optional[int]]:
    """'P172171, 300' -> ('P172171', 300)"""
    if not s:
        return None, None
    txt = str(s).strip()
    if not txt:
        return None, None
    parts = [p.strip() for p in txt.split(",")]
    po_no = parts[0] if parts else None
    qty_val = parse_int(parts[1]) if len(parts) > 1 else None
    return (po_no or None), qty_val

def normalize_size(s: Optional[str]) -> Optional[str]:
    if not s:
        return None
    return " ".join(str(s).replace('""', '"').strip().split())

def money_or_none(x: Optional[Decimal]) -> Optional[Decimal]:
    return x if (x is not None and x != Decimal("0")) else None

# ------------- sequences -------------

def fix_sequences(db: Session, table_cols: Iterable[Tuple[str, str]]):
    for table_name, id_col in table_cols:
        db.execute(text("""
            SELECT setval(
                pg_get_serial_sequence(:tname, :idcol),
                COALESCE((SELECT MAX({id}) FROM {tbl}), 1) + 1,
                false
            )
        """.format(id=id_col, tbl=table_name)), {"tname": table_name, "idcol": id_col})
    db.commit()

# ------------- upserts: customer side (unchanged from prior edited version) -------------

def get_or_upsert_customer(db: Session, raw_name_or_code: Optional[str]) -> Customer:
    raw = (raw_name_or_code or "").strip()
    mapped = CUSTOMER_CODE_MAP.get(raw, raw)
    code = mapped or DEFAULT_CUSTOMER_CODE
    cust = db.execute(select(Customer).where(Customer.code == code)).scalar_one_or_none()
    if cust:
        return cust
    cust = Customer(code=code, name=(DEFAULT_CUSTOMER_NAME if code == DEFAULT_CUSTOMER_CODE else code))
    db.add(cust); db.flush(); return cust

def get_or_upsert_part(db: Session, part_no: str, name: Optional[str]) -> Part:
    """Map 'Part no.' → parts.part_no (per your request)."""
    part = db.execute(select(Part).where(Part.part_no == part_no)).scalar_one_or_none()
    if not part:
        part = Part(part_no=part_no, name=(name or part_no))
        db.add(part); db.flush(); return part
    if name and part.name != name:
        part.name = name; db.flush()
    return part

def get_or_upsert_revision(db: Session, part: Part, rev_code: Optional[str]) -> Optional[PartRevision]:
    if not rev_code: return None
    pr = db.execute(select(PartRevision).where(PartRevision.part_id==part.id, PartRevision.rev==rev_code)).scalar_one_or_none()
    if pr: return pr
    pr = PartRevision(part_id=part.id, rev=rev_code, is_current=False)
    db.add(pr); db.flush(); return pr

def get_or_upsert_po(db: Session, po_number: str, customer: Customer) -> PO:
    po = db.execute(select(PO).where(PO.po_number==po_number)).scalar_one_or_none()
    if po:
        if not po.customer_id:
            po.customer_id = customer.id; db.flush()
        return po
    po = PO(po_number=po_number, description=None, customer_id=customer.id)
    db.add(po); db.flush(); return po

def get_or_upsert_poline(db: Session, po: PO, part: Part, rev: Optional[PartRevision],
                         qty_ordered: Optional[Decimal], unit_price: Optional[Decimal], due_date: Optional[date]) -> POLine:
    target_due_dt = to_utc_midnight(due_date) if due_date else None
    q = select(POLine).where(POLine.po_id==po.id, POLine.part_id==part.id,
                             POLine.revision_id==(rev.id if rev else None), POLine.due_date==target_due_dt)
    line = db.execute(q).scalar_one_or_none()
    if not line:
        line = POLine(po_id=po.id, part_id=part.id, revision_id=(rev.id if rev else None),
                      qty_ordered=(qty_ordered if qty_ordered is not None else Decimal(0)),
                      unit_price=unit_price, due_date=target_due_dt, notes=None)
        db.add(line); db.flush(); return line
    changed=False
    if not line.revision_id and rev: line.revision_id=rev.id; changed=True
    if qty_ordered is not None and line.qty_ordered!=qty_ordered and (seconds_since(line.created_at) or 0)>=5: line.qty_ordered=qty_ordered; changed=True
    if unit_price is not None and line.unit_price!=unit_price and (seconds_since(line.created_at) or 0)>=5: line.unit_price=unit_price; changed=True
    if line.due_date!=target_due_dt and (seconds_since(line.created_at) or 0)>=5: line.due_date=target_due_dt; changed=True
    if changed: db.flush()
    return line

def get_or_upsert_lot(db: Session, lot_no: Optional[str], po_line: POLine, planned_qty: Optional[Decimal],
                      lot_due: Optional[date], started_at: Optional[date],
                      note_text: Optional[str]=None, fair_note: Optional[str]=None) -> Optional[ProductionLot]:
    if not lot_no: return None
    lot = db.execute(select(ProductionLot).where(ProductionLot.lot_no==lot_no)).scalar_one_or_none()
    if not lot:
        lot = ProductionLot(lot_no=lot_no, part_id=po_line.part_id, part_revision_id=po_line.revision_id,
                            po_id=po_line.po_id, po_line_id=po_line.id,
                            planned_qty=int(planned_qty) if planned_qty is not None else 0,
                            lot_due_date=lot_due, started_at=to_utc_midnight(started_at) if started_at else None,
                            status="in_process", note=(note_text.strip() if note_text else None),
                            fair_note=(fair_note.strip() if fair_note else None))
        db.add(lot); db.flush(); return lot
    changed=False
    if lot.po_line_id!=po_line.id: lot.po_line_id=po_line.id; changed=True
    if lot.part_id!=po_line.part_id: lot.part_id=po_line.part_id; changed=True
    if lot.part_revision_id!=po_line.revision_id: lot.part_revision_id=po_line.revision_id; changed=True
    pq=int(planned_qty) if planned_qty is not None else lot.planned_qty
    if pq!=lot.planned_qty: lot.planned_qty=pq; changed=True
    if lot.lot_due_date!=lot_due: lot.lot_due_date=lot_due; changed=True
    ns=to_utc_midnight(started_at) if started_at else None
    if (lot.started_at or None)!=(ns or None): lot.started_at=ns; changed=True
    if note_text is not None and (lot.note or "").strip()!=note_text.strip(): lot.note=note_text.strip(); changed=True
    if fair_note is not None and (lot.fair_note or "").strip()!=fair_note.strip(): lot.fair_note=fair_note.strip(); changed=True
    if changed: db.flush()
    return lot

def get_or_upsert_shipment(db: Session, po: PO, ship_date: date, package_no: str,
                           ship_to: Optional[str]=None, carrier: Optional[str]=None,
                           tracking_no: Optional[str]=None, notes: Optional[str]=None) -> CustomerShipment:
    shipped_at = to_utc_midnight(ship_date)
    q = select(CustomerShipment).where(CustomerShipment.po_id==po.id,
                                       CustomerShipment.shipped_at==shipped_at,
                                       CustomerShipment.package_no==package_no)
    s = db.execute(q).scalar_one_or_none()
    if s:
        changed=False
        if ship_to is not None and s.ship_to!=ship_to: s.ship_to=ship_to; changed=True
        if carrier is not None and s.carrier!=carrier: s.carrier=carrier; changed=True
        if tracking_no is not None and s.tracking_no!=tracking_no: s.tracking_no=tracking_no; changed=True
        if notes is not None and s.notes!=notes: s.notes=notes; changed=True
        if changed: db.flush()
        return s
    s = CustomerShipment(po_id=po.id, shipped_at=shipped_at, ship_to=ship_to,
                         carrier=carrier, tracking_no=tracking_no, notes=notes, package_no=package_no)
    db.add(s); db.flush(); return s

def get_or_upsert_shipment_item(db: Session, shipment: CustomerShipment, po_line: POLine,
                                lot: Optional[ProductionLot], qty: Optional[int]) -> CustomerShipmentItem:
    q = select(CustomerShipmentItem).where(
        CustomerShipmentItem.shipment_id==shipment.id,
        CustomerShipmentItem.po_line_id==po_line.id,
        and_((CustomerShipmentItem.lot_id==None) if lot is None else (CustomerShipmentItem.lot_id==lot.id)),
    )
    item = db.execute(q).scalar_one_or_none()
    if item:
        if qty is not None and item.qty != qty:
            item.qty = qty; db.flush()
        return item
    item = CustomerShipmentItem(shipment_id=shipment.id, po_line_id=po_line.id,
                                lot_id=(lot.id if lot else None), qty=(qty if qty is not None else 0))
    db.add(item); db.flush(); return item

def get_or_upsert_invoice(db: Session, invoice_no: str, po: PO, invoice_date: Optional[date],
                          status: str="open", notes: Optional[str]=None) -> CustomerInvoice:
    inv = db.execute(select(CustomerInvoice).where(CustomerInvoice.invoice_no==invoice_no)).scalar_one_or_none()
    if inv:
        changed=False
        if inv.po_id!=po.id: inv.po_id=po.id; changed=True
        if invoice_date is not None and inv.invoice_date!=invoice_date: inv.invoice_date=invoice_date; changed=True
        if notes is not None and inv.notes!=notes: inv.notes=notes; changed=True
        if status and inv.status!=status: inv.status=status; changed=True
        if changed: db.flush()
        return inv
    inv = CustomerInvoice(invoice_no=invoice_no, po_id=po.id,
                          invoice_date=(invoice_date or date.today()), status=status, notes=notes)
    db.add(inv); db.flush(); return inv

def get_or_insert_invoice_line(db: Session, invoice: CustomerInvoice, po_line: POLine,
                               shipment_item: Optional[CustomerShipmentItem], qty: Optional[int]) -> CustomerInvoiceLine:
    q = select(CustomerInvoiceLine).where(CustomerInvoiceLine.invoice_id==invoice.id,
                                          CustomerInvoiceLine.po_line_id==po_line.id,
                                          and_((CustomerInvoiceLine.shipment_item_id==None)
                                               if shipment_item is None
                                               else (CustomerInvoiceLine.shipment_item_id==shipment_item.id)))
    line = db.execute(q).scalar_one_or_none()
    final_qty = qty if qty is not None else int(po_line.qty_ordered or 0)
    unit_price = po_line.unit_price or Decimal(0)
    amount = Decimal(final_qty) * unit_price
    if line:
        changed=False
        if line.qty!=final_qty: line.qty=final_qty; changed=True
        if line.unit_price!=unit_price: line.unit_price=unit_price; changed=True
        if line.amount!=amount: line.amount=amount; changed=True
        if changed: db.flush()
        return line
    line = CustomerInvoiceLine(invoice_id=invoice.id, po_line_id=po_line.id,
                               shipment_item_id=(shipment_item.id if shipment_item else None),
                               qty=final_qty, unit_price=unit_price, amount=amount)
    db.add(line); db.flush(); return line

# ------------- upserts: material side (mapping per your spec) -------------

def get_or_upsert_supplier(db: Session, code_or_name: str) -> Supplier:
    code = (code_or_name or "").strip() or "UNKNOWN-SUPPLIER"
    s = db.execute(select(Supplier).where(Supplier.code==code)).scalar_one_or_none()
    if s: return s
    s = Supplier(code=code, name=code, is_material_supplier=True)
    db.add(s); db.flush(); return s

def get_or_upsert_raw_material(db: Session, code: str, name: Optional[str], spec: Optional[str]) -> RawMaterial:
    rm = db.execute(select(RawMaterial).where(RawMaterial.code==code)).scalar_one_or_none()
    if not rm:
        rm = RawMaterial(code=code, name=(name or code), spec=spec, uom="ea")
        db.add(rm); db.flush(); return rm
    changed=False
    if name and rm.name!=name: rm.name=name; changed=True
    if spec and rm.spec!=spec: rm.spec=spec; changed=True
    if changed: db.flush()
    return rm

def get_or_upsert_material_po(db: Session, po_number: str, supplier: Supplier,
                              order_date: Optional[date], notes: Optional[str]) -> MaterialPO:
    mpo = db.execute(select(MaterialPO).where(MaterialPO.po_number==po_number)).scalar_one_or_none()
    if mpo:
        changed=False
        if mpo.supplier_id!=supplier.id: mpo.supplier_id=supplier.id; changed=True
        if order_date and mpo.order_date!=order_date: mpo.order_date=order_date; changed=True
        if notes and (mpo.notes or "")!=notes: mpo.notes=notes if not mpo.notes else mpo.notes
        if changed: db.flush()
        return mpo
    mpo = MaterialPO(po_number=po_number, supplier_id=supplier.id, order_date=(order_date or date.today()),
                     status="open", notes=notes)
    db.add(mpo); db.flush(); return mpo

def get_or_upsert_material_po_line(db: Session, mpo: MaterialPO, rm: RawMaterial,
                                   qty_ordered: Optional[Decimal], unit_price: Optional[Decimal], due: Optional[date]) -> MaterialPOLine:
    q = select(MaterialPOLine).where(MaterialPOLine.po_id==mpo.id,
                                     MaterialPOLine.material_id==rm.id,
                                     MaterialPOLine.due_date==(due if due else None))
    line = db.execute(q).scalar_one_or_none()
    if line:
        changed=False
        if qty_ordered is not None and line.qty_ordered!=qty_ordered: line.qty_ordered=qty_ordered; changed=True
        if unit_price is not None and line.unit_price!=unit_price: line.unit_price=unit_price; changed=True
        if changed: db.flush()
        return line
    line = MaterialPOLine(po_id=mpo.id, material_id=rm.id,
                          qty_ordered=(qty_ordered or Decimal(0)), unit_price=unit_price, due_date=due)
    db.add(line); db.flush(); return line

def get_or_upsert_raw_batch(db: Session, rm: RawMaterial, supplier: Supplier, mpo: MaterialPO, line: MaterialPOLine,
                            batch_no: str, received_at: Optional[date], qty_received: Optional[Decimal],
                            supplier_batch_no: Optional[str], mill_heat_no: Optional[str],
                            cert_file: Optional[str]=None, location: Optional[str]=None) -> RawBatch:
    q = select(RawBatch).where(RawBatch.material_id==rm.id, RawBatch.batch_no==batch_no, RawBatch.supplier_id==supplier.id)
    rb = db.execute(q).scalar_one_or_none()
    if rb:
        changed=False
        if received_at and rb.received_at!=received_at: rb.received_at=received_at; changed=True
        if qty_received is not None and rb.qty_received!=qty_received: rb.qty_received=qty_received; changed=True
        if supplier_batch_no and rb.supplier_batch_no!=supplier_batch_no: rb.supplier_batch_no=supplier_batch_no; changed=True
        if mill_heat_no and rb.mill_heat_no!=mill_heat_no: rb.mill_heat_no=mill_heat_no; changed=True
        if (rb.material_po_line_id!=line.id) or (rb.po_id!=mpo.id):
            rb.material_po_line_id=line.id; rb.po_id=mpo.id; changed=True
        if location and rb.location!=location: rb.location=location; changed=True
        if cert_file and rb.cert_file!=cert_file: rb.cert_file=cert_file; changed=True
        if changed: db.flush()
        return rb
    rb = RawBatch(material_id=rm.id, supplier_id=supplier.id,
                  material_po_line_id=line.id, po_id=mpo.id,
                  batch_no=batch_no, supplier_batch_no=supplier_batch_no,
                  mill_heat_no=mill_heat_no, received_at=received_at,
                  qty_received=(qty_received or Decimal(0)),
                  cert_file=cert_file, location=location)
    db.add(rb); db.flush(); return rb

# ---------------- main ----------------

def main():
    with SessionLocal() as db:
        fix_sequences(db, [
            # customer-side
            ("customers","id"),("parts","id"),("part_revisions","id"),
            ("purchase_orders","id"),("po_lines","id"),
            ("production_lots","id"),
            ("customer_shipments","id"),("customer_shipment_items","id"),
            ("customer_invoices","id"),("customer_invoice_lines","id"),
            # material-side
            ("suppliers","id"),("raw_materials","id"),
            ("material_pos","id"),("material_po_lines","id"),("raw_batches","id"),
        ])

        with CSV_FILE.open("r", encoding=CSV_ENCODING, newline="") as f:
            reader = csv.DictReader(f, delimiter=CSV_DELIMITER)
            processed = 0

            for row in reader:
                # -------- MATERIAL mapping (your spec) --------
                mat_company     = pick(row, "Company")
                mat_po_qty      = pick(row, "PO#, Qty", 'PO#, Qty')
                mat_part_no     = pick(row, "Part no.", "Part no")
                mat_heat_lot    = pick(row, "Heat lot", "Heat Lot", "Heat")
                mat_date        = parse_date(pick(row, "Date"))
                mat_vendor_po   = pick(row, "Vendor PO")
                mat_otq         = pick(row, "On time/Quality")
                mat_cut_rec_ht  = pick(row, "Cutting Receiving/HT")
                mat_cert        = pick(row, "Material Cert")
                mat_type        = pick(row, "Type")
                mat_spec        = pick(row, "Spec.", "Spec")
                mat_size        = normalize_size(pick(row, "Size"))
                mat_length      = normalize_size(pick(row, "Length"))
                mat_weight_txt  = pick(row, "Weight")
                mat_price       = clean_money(pick(row, " Price ", "Price"))
                mat_cut_charge  = clean_money(pick(row, " Cut Charge ", "Cut Charge"))
                mat_total       = clean_money(pick(row, " Total ", "Total"))

                mat_weight = None
                try:
                    if mat_weight_txt:
                        mat_weight = Decimal(str(mat_weight_txt).replace(",", "").replace('"', "").strip())
                except Exception:
                    mat_weight = None

                # If required fields for material row exist, process as material
                if mat_company and (mat_po_qty or mat_vendor_po) and mat_part_no and mat_heat_lot:
                    supplier = get_or_upsert_supplier(db, mat_company)

                    mpo_no, mpo_qty_int = parse_po_qty_field(mat_po_qty)
                    if not mpo_no:
                        mpo_no = f"MAT-{(mat_vendor_po or 'UNKNOWN').strip()}"

                    # parts.part_no (requested): create/ensure Part as well (name mirrors raw material name)
                    rm_name_bits = [x for x in [mat_type, mat_spec, mat_size] if x]
                    rm_name = ", ".join(rm_name_bits) if rm_name_bits else mat_part_no
                    get_or_upsert_part(db, part_no=mat_part_no, name=rm_name)  # satisfies "Part no. → parts.part_no"

                    # raw_materials
                    rm = get_or_upsert_raw_material(db, code=mat_part_no, name=rm_name, spec=mat_spec)

                    # material_pos (PO header)
                    # order_date ← Date; notes starts with Vendor PO (if present)
                    mpo = get_or_upsert_material_po(
                        db=db,
                        po_number=mpo_no,
                        supplier=supplier,
                        order_date=mat_date,
                        notes=mat_vendor_po
                    )

                    # material_po_lines
                    qty_ordered = Decimal(mpo_qty_int) if mpo_qty_int is not None else (mat_weight if mat_weight is not None else Decimal(0))
                    unit_price = money_or_none(mat_price)
                    line = get_or_upsert_material_po_line(
                        db=db, mpo=mpo, rm=rm,
                        qty_ordered=qty_ordered, unit_price=unit_price, due=mat_date
                    )

                    # raw_batches
                    qty_received = (mat_weight if mat_weight is not None else qty_ordered)
                    get_or_upsert_raw_batch(
                        db=db, rm=rm, supplier=supplier, mpo=mpo, line=line,
                        batch_no=mat_heat_lot, received_at=mat_date,
                        qty_received=qty_received, supplier_batch_no=mat_vendor_po,
                        mill_heat_no=mat_heat_lot
                    )

                    # append extra context to material_pos.notes
                    extras = []
                    if mat_otq:        extras.append(f"OnTime/Quality: {mat_otq}")
                    if mat_cut_rec_ht: extras.append(f"Cut/Recv/HT: {mat_cut_rec_ht}")
                    if mat_cert:       extras.append(f"Cert: {mat_cert}")
                    if mat_length:     extras.append(f"Length: {mat_length}")
                    if mat_total:      extras.append(f"Total={mat_total}")
                    if mat_cut_charge: extras.append(f"CutCharge={mat_cut_charge}")
                    if extras:
                        mpo.notes = ((mpo.notes or "") + ("\n" if mpo.notes else "") + " | ".join(extras)).strip()
                        db.flush()

                    processed += 1
                    if processed % 500 == 0:
                        db.commit()
                    # done with material row; proceed next
                    continue

                # -------- CUSTOMER / LOT logic (unchanged) --------
                customer_code = pick(row, "Name", "Customer", "Customer Code")
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

                ship_date = parse_date(pick(row, "Ship Date", "Shipped Date", "Shipped"))
                qty_shipped = parse_int(pick(row, "Qty Shipped", "Shipped Qty", "Qty Ship"))
                invoice_no = pick(row, "Invoice #", "Invoice", "Invoice No")
                order_date = parse_date(pick(row, "Order Date", "PO Date"))

                if not part_no:
                    continue

                customer = get_or_upsert_customer(db, customer_code)
                part = get_or_upsert_part(db, part_no=part_no, name=description)
                rev = get_or_upsert_revision(db, part, rev_code) if rev_code else None

                if po_number:
                    po = get_or_upsert_po(db, po_number, customer)
                    line = get_or_upsert_poline(
                        db=db, po=po, part=part, rev=rev,
                        qty_ordered=(Decimal(qty_po) if qty_po is not None else None),
                        unit_price=price_each, due_date=due_original
                    )
                    lot = get_or_upsert_lot(
                        db=db, lot_no=lot_no, po_line=line,
                        planned_qty=(Decimal(qty_po) if qty_po is not None else None),
                        lot_due=lot_due_date, started_at=lot_start_date,
                        note_text=need_remark, fair_note=fair_no
                    )

                    shipment = None; shipment_item = None
                    if ship_date and qty_shipped:
                        package_no = (lot_no if lot_no else f"{po_number}-{part_no}")
                        shipment = get_or_upsert_shipment(
                            db=db, po=po, ship_date=ship_date, package_no=package_no
                        )
                        shipment_item = get_or_upsert_shipment_item(
                            db=db, shipment=shipment, po_line=line, lot=lot, qty=qty_shipped
                        )

                    if invoice_no:
                        inv = get_or_upsert_invoice(
                            db=db, invoice_no=invoice_no, po=po,
                            invoice_date=(ship_date or order_date), status="open", notes=None
                        )
                        get_or_insert_invoice_line(
                            db=db, invoice=inv, po_line=line, shipment_item=shipment_item,
                            qty=(qty_shipped if qty_shipped is not None else None)
                        )

                processed += 1
                if processed % 500 == 0:
                    db.commit()

            db.commit()

    print(f"✅ Done. Processed rows from {CSV_FILE.name}")

if __name__ == "__main__":
    main()
