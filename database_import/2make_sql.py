# -*- coding: utf-8 -*-
# ✅ Summary order:
# Customer |→ Part → Revision |→ Purchase Order → PO Line |→ Lot → Shipment → Shipment Item |→ Invoice → Invoice Line
import re
import json
from decimal import Decimal
from pathlib import Path
from datetime import datetime
import pandas as pd

# --------------------------- CONFIG ---------------------------
EXCEL_PATH  = r"C:\Users\TPSERVER\database\Lot_number.xls"
OUTPUT_SQL  = r"C:\Users\TPSERVER\database\lot_import.sql"
DEBUG_JSON  = r"C:\Users\TPSERVER\database\lot_import.debug.json"
PREVIEW_CSV = r"C:\Users\TPSERVER\database\lot_import.preview.csv"

# Split settings
ROWS_PER_FILE = 500  # how many Excel rows per .sql part file
OUT_DIR = Path(r"C:\Users\TPSERVER\database\lot_import_parts")
BASE_NAME = "lot_import_part"
RUN_ALL_FILE = Path(r"C:\Users\TPSERVER\database\lot_import_run_all.sql")

# If True, shipments will include a notes tag "LOT:<lot_no>" for idempotent matching
USE_LOT_NOTE_TAG = True

# ---------------------- Header normalization ------------------
def norm_header(h: str) -> str:
    return re.sub(r'[^a-z0-9]', '', str(h).strip().lower())

# Map many header variants -> canonical names we use below
HEADER_MAP = {
    "date": "Date",
    "name": "Customer",
    "lot#": "LotNo", "lotno": "LotNo", "lot": "LotNo",
    "po": "PO",
    "partno.": "PartNo", "partno": "PartNo", "part#": "PartNo", "partnumber": "PartNo",
    "description": "Description",
    "rev.": "Rev", "rev": "Rev",
    "duedate": "DueDate",
    "qtypo": "QtyPO", "qtyp o": "QtyPO", "qtypurchaseorder": "QtyPO", "qtypoline": "QtyPO",
    "price": "Price", " price ": "Price",
    "total": "Total",
    "fair#": "FAIR", "fairno": "FAIR", "fair": "FAIR",
    "shippeddate": "ShipDate",
    "qtyshipped": "QtyShipped",
    "invoiceno.": "InvoiceNo", "invoiceno": "InvoiceNo",
    "need/remark": "Remark", "needremark": "Remark", "remark": "Remark",
}

# ---------------------- Safe value helpers --------------------
def s(val):
    """Safe string or None (handles NaN/floats/ints)."""
    if val is None:
        return None
    if isinstance(val, float) and pd.isna(val):
        return None
    txt = str(val).strip()
    return txt if txt else None

def parse_date(val):
    txt = s(val)
    if not txt:
        return None
    for fmt in ("%m/%d/%y", "%m/%d/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(txt, fmt).date().strftime("%Y-%m-%d")
        except ValueError:
            pass
    try:
        d = pd.to_datetime(txt, errors="coerce")
        return None if pd.isna(d) else d.date().strftime("%Y-%m-%d")
    except Exception:
        return None

def int_or_none(val, allow_float=True):
    txt = s(val)
    if not txt or txt in {"-", "–", "—", "NA", "N/A", "None", "null"}:
        return None
    txt = txt.replace(",", "")
    if not re.fullmatch(r"-?\d+(\.\d+)?", txt):
        return None
    return int(float(txt)) if allow_float else int(txt)

def money_to_decimal(val):
    txt = s(val)
    if not txt or txt in {"-", "–", "—"}:
        return None
    txt = txt.replace("$", "").replace(",", "").strip()
    if txt.startswith("(") and txt.endswith(")"):  # accounting negative
        txt = "-" + txt[1:-1]
    try:
        return str(Decimal(txt))
    except Exception:
        return None

# ------------------------ SQL literal helpers -----------------
def q(x):   # SQL string
    return "NULL" if x is None else "'" + str(x).replace("'", "''") + "'"

def qd(x):  # SQL date
    return "NULL" if x is None else f"DATE {q(x)}"

def qn(x):  # SQL numeric
    return "NULL" if x is None or str(x) == "" else str(x)

def qn0(x):  # SQL numeric defaulting to 0 if missing
    v = qn(x)
    return "0" if v == "NULL" else v

# ----------------------- Read the Excel (.xls) ----------------
# IMPORTANT: xlrd is needed for .xls (pip install xlrd==2.0.1)
xls = pd.ExcelFile(EXCEL_PATH, engine="xlrd")

def pick_sheet(xls_file: pd.ExcelFile) -> str:
    best = (0, xls_file.sheet_names[0])
    for sh in xls_file.sheet_names:
        # print(sh)
        try:
            tmp = pd.read_excel(EXCEL_PATH, sheet_name=sh, nrows=1, header=0, dtype=str, engine="xlrd")
        except Exception:
            continue
        keys = [norm_header(c) for c in tmp.columns]
        score = 0
        if any(k.startswith("lot") for k in keys): score += 1
        if any(k.startswith("part") for k in keys): score += 1
        if "po" in keys: score += 1
        if score > best[0]:
            best = (score, sh)
    return best[1]

sheet_to_use = pick_sheet(xls)
# sheet_to_use = "Lot start 08-02-21"
df_raw = pd.read_excel(EXCEL_PATH, sheet_name=sheet_to_use, header=0, dtype=str, engine="xlrd")

# Normalize headers
rename = {}
for c in df_raw.columns:
    k = norm_header(c)
    if k in HEADER_MAP:
        rename[c] = HEADER_MAP[k]
print(rename)
df = df_raw.rename(columns=rename).copy()

# Preview file (first 25 rows) so you can verify quickly
preview_cols = [c for c in [
    "Date","Customer","LotNo","PO","PartNo","Description","Rev","DueDate",
    "QtyPO","Price","Total","FAIR","ShipDate","QtyShipped","InvoiceNo","Remark"
] if c in df.columns]
df_preview = df[preview_cols].head(25) if preview_cols else df.head(25)
Path(PREVIEW_CSV).parent.mkdir(parents=True, exist_ok=True)
df_preview.to_csv(PREVIEW_CSV, index=False, encoding="utf-8-sig")

# --------------------------- Build SQL ------------------------
lines = []
emit = lines.append

# psql meta-commands (kept in combined file; parts add their own too)
emit(r"\set ON_ERROR_STOP on")
# emit(r"\set ECHO all")  # uncomment if you want echo in the big file

emit("-- AUTOGENERATED SQL for Customer Orders/Lots/Shipments/Invoices")
emit("BEGIN;")

skipped = {"no_customer": 0, "no_po": 0, "no_part": 0}
emitted = 0

for i, r in df.iterrows():
    # mark boundary for splitting
    emit(f"-- __ROW_BOUNDARY__ {i+1}")

    # Safe scalar getter
    def g(col): return r[col] if col in df.columns else None

    cust_code  = s(g("Customer"))
    lot_no     = s(g("LotNo"))
    po_no      = s(g("PO"))
    part_no    = s(g("PartNo"))
    desc       = s(g("Description")) or part_no
    rev        = s(g("Rev"))
    order_date = parse_date(g("Date"))
    due_date   = parse_date(g("DueDate"))

    qty_po      = int_or_none(g("QtyPO"))
    price       = money_to_decimal(g("Price"))
    total_line  = money_to_decimal(g("Total"))  # parsed for completeness
    fair        = s(g("FAIR"))
    ship_date   = parse_date(g("ShipDate"))
    qty_shipped = int_or_none(g("QtyShipped"))
    invoice_no  = s(g("InvoiceNo"))
    remark      = s(g("Remark"))
    fair_required_sql = "TRUE" if fair else "FALSE"

    # Must-haves
    if not part_no:
        skipped["no_part"] += 1
        continue
    if not po_no:
        skipped["no_po"] += 1
        continue
    if not cust_code:
        skipped["no_customer"] += 1
        continue

    # CUSTOMER
    emit(f"""
-- Row {i+1}: {cust_code} / {po_no} / {part_no} / Lot {lot_no or '-'}
INSERT INTO customers (code, name)
VALUES ({q(cust_code)}, {q(cust_code)})
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;
""".strip())

    # PART
    emit(f"""
INSERT INTO parts (part_no, name, status)
VALUES ({q(part_no)}, {q(desc or part_no)}, 'active')
ON CONFLICT (part_no) DO UPDATE SET name = EXCLUDED.name;
""".strip())

    # PART REV
    if rev:
        emit(f"""
INSERT INTO part_revisions (part_id, rev, is_current)
SELECT p.id, {q(rev)}, FALSE
FROM parts p
WHERE p.part_no = {q(part_no)}
ON CONFLICT (part_id, rev) DO NOTHING;
""".strip())

    # PURCHASE ORDER
    emit(f"""
INSERT INTO purchase_orders (po_number, description, customer_id)
SELECT {q(po_no)}, NULL, c.id
FROM customers c
WHERE c.code = {q(cust_code)}
ON CONFLICT (po_number) DO UPDATE SET customer_id = EXCLUDED.customer_id;
""".strip())

    # PO LINE (pack FAIR + Remark into notes)
    notes = " | ".join([x for x in [("FAIR# " + fair) if fair else None, remark] if x]) or None
    emit(f"""
INSERT INTO po_lines (po_id, part_id, revision_id, qty_ordered, unit_price, due_date, notes)
SELECT po.id, p.id,
       {"pr.id" if rev else "NULL"},
       {qn0(qty_po)},            -- default missing qty to 0
       {qn0(price)},             -- default missing price to 0
       {qd(due_date)}, {q(notes)}
FROM purchase_orders po
JOIN customers c ON c.id = po.customer_id AND c.code = {q(cust_code)}
JOIN parts p ON p.part_no = {q(part_no)}
{"LEFT JOIN part_revisions pr ON pr.part_id = p.id AND pr.rev = " + q(rev) if rev else ""}
WHERE po.po_number = {q(po_no)}
AND NOT EXISTS (
    SELECT 1 FROM po_lines x
    WHERE x.po_id = po.id
      AND x.part_id = p.id
      {"AND x.revision_id = pr.id" if rev else "AND x.revision_id IS NULL"}
);
""".strip())

    # PRODUCTION LOT
    if lot_no:
        if rev:
            emit(f"""
INSERT INTO production_lots
  (lot_no, part_id, part_revision_id, po_id, po_line_id, planned_qty, status, fair_required, created_at)
SELECT {q(lot_no)}, pl.part_id, pl.revision_id, pl.po_id, pl.id,
       COALESCE({qn(qty_po)}, 0),
       CASE WHEN {qn(qty_shipped)} IS NOT NULL AND {qn(qty_po)} IS NOT NULL AND {qn(qty_shipped)} >= {qn(qty_po)}
            THEN 'closed' ELSE 'in_process' END,
       {fair_required_sql},
       NOW()
FROM po_lines pl
JOIN purchase_orders po ON po.id = pl.po_id AND po.po_number = {q(po_no)}
JOIN customers c ON c.id = po.customer_id AND c.code = {q(cust_code)}
JOIN parts p ON p.id = pl.part_id AND p.part_no = {q(part_no)}
JOIN part_revisions pr ON pr.id = pl.revision_id AND pr.rev = {q(rev)}
WHERE NOT EXISTS (
    SELECT 1 FROM production_lots l WHERE l.lot_no = {q(lot_no)}
)  -- keep this for clarity, but conflict is the real guard
ON CONFLICT (lot_no) DO NOTHING;
""".strip())
        else:
            emit(f"""
INSERT INTO production_lots
  (lot_no, part_id, part_revision_id, po_id, po_line_id, planned_qty, status, fair_required, created_at)
SELECT {q(lot_no)}, pl.part_id, pl.revision_id, pl.po_id, pl.id,
       COALESCE({qn(qty_po)}, 0),
       CASE WHEN {qn(qty_shipped)} IS NOT NULL AND {qn(qty_po)} IS NOT NULL AND {qn(qty_shipped)} >= {qn(qty_po)}
            THEN 'closed' ELSE 'in_process' END,
       {fair_required_sql},
       NOW()
FROM po_lines pl
JOIN purchase_orders po ON po.id = pl.po_id AND po.po_number = {q(po_no)}
JOIN customers c ON c.id = po.customer_id AND c.code = {q(cust_code)}
JOIN parts p ON p.id = pl.part_id AND p.part_no = {q(part_no)}
LEFT JOIN part_revisions pr ON pr.id = pl.revision_id
WHERE pl.revision_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM production_lots l WHERE l.lot_no = {q(lot_no)}
)
ON CONFLICT (lot_no) DO NOTHING;
""".strip())


    # CUSTOMER SHIPMENT + ITEM (one shipment per row)
    if ship_date and qty_shipped:
        lot_note = f"LOT:{lot_no}" if (USE_LOT_NOTE_TAG and lot_no) else ""
        emit(f"""
INSERT INTO customer_shipments (po_id, shipped_at, ship_to, carrier, tracking_no, notes)
SELECT po.id, {qd(ship_date)}, NULL, NULL, NULL, {q(lot_note)}
FROM purchase_orders po
JOIN customers c ON c.id = po.customer_id AND c.code = {q(cust_code)}
WHERE po.po_number = {q(po_no)}
AND NOT EXISTS (
    SELECT 1 FROM customer_shipments s
    WHERE s.po_id = po.id
      AND s.shipped_at = {qd(ship_date)}
      AND COALESCE(s.notes,'') = {q(lot_note)}
);
""".strip())

        emit(f"""
INSERT INTO customer_shipment_items (shipment_id, po_line_id, lot_id, qty)
SELECT s.id, pl.id, l.id, {qn(qty_shipped)}
FROM purchase_orders po
JOIN customers c ON c.id = po.customer_id AND c.code = {q(cust_code)}
JOIN po_lines pl ON pl.po_id = po.id
JOIN parts p ON p.id = pl.part_id AND p.part_no = {q(part_no)}
{"LEFT JOIN part_revisions pr ON pr.id = pl.revision_id AND pr.rev = " + q(rev) if rev else ""}
JOIN customer_shipments s ON s.po_id = po.id
    AND s.shipped_at = {qd(ship_date)}
    AND COALESCE(s.notes,'') = {q(lot_note)}
LEFT JOIN production_lots l ON l.lot_no = {q(lot_no)} AND l.po_line_id = pl.id
WHERE po.po_number = {q(po_no)}
AND NOT EXISTS (
    SELECT 1 FROM customer_shipment_items si
    WHERE si.shipment_id = s.id
      AND si.po_line_id = pl.id
      AND COALESCE(si.lot_id, -1) = COALESCE(l.id, -1)
);
""".strip())

    # CUSTOMER INVOICE + LINE
    if invoice_no:
        emit(f"""
INSERT INTO customer_invoices (invoice_no, po_id, invoice_date, status, notes)
SELECT {q(invoice_no)}, po.id, {qd(ship_date or order_date)}, 'open', NULL
FROM purchase_orders po
JOIN customers c ON c.id = po.customer_id AND c.code = {q(cust_code)}
WHERE po.po_number = {q(po_no)}
ON CONFLICT (invoice_no) DO UPDATE SET po_id = EXCLUDED.po_id;
""".strip())

        lot_note = f"LOT:{lot_no}" if (USE_LOT_NOTE_TAG and lot_no) else ""
        emit(f"""
INSERT INTO customer_invoice_lines (invoice_id, po_line_id, shipment_item_id, qty, unit_price, amount)
SELECT inv.id, pl.id, si.id,
       {qn(qty_shipped) if qty_shipped else "COALESCE(pl.qty_ordered, 0)"},
       pl.unit_price,
       ({qn(qty_shipped) if qty_shipped else "COALESCE(pl.qty_ordered, 0)"} * pl.unit_price)
FROM purchase_orders po
JOIN customers c ON c.id = po.customer_id AND c.code = {q(cust_code)}
JOIN po_lines pl ON pl.po_id = po.id
JOIN customer_invoices inv ON inv.po_id = po.id AND inv.invoice_no = {q(invoice_no)}
LEFT JOIN production_lots l ON l.lot_no = {q(lot_no)} AND l.po_line_id = pl.id
LEFT JOIN customer_shipments s ON s.po_id = po.id AND {("s.shipped_at = " + qd(ship_date) + " AND ") if ship_date else ""}COALESCE(s.notes,'') = {q(lot_note if (ship_date and qty_shipped) else "")}
LEFT JOIN customer_shipment_items si ON si.shipment_id = s.id AND si.po_line_id = pl.id AND (si.lot_id = l.id OR (si.lot_id IS NULL AND l.id IS NULL))
WHERE po.po_number = {q(po_no)}
  AND pl.part_id = (SELECT id FROM parts WHERE part_no = {q(part_no)})
  {"AND pl.revision_id = (SELECT id FROM part_revisions WHERE part_id = pl.part_id AND rev = " + q(rev) + ")" if rev else "AND pl.revision_id IS NULL"}
AND NOT EXISTS (
    SELECT 1 FROM customer_invoice_lines xil
    WHERE xil.invoice_id = inv.id
      AND xil.po_line_id = pl.id
      AND COALESCE(xil.shipment_item_id, -1) = COALESCE(si.id, -1)
);
""".strip())

    emitted += 1

emit("COMMIT;")

# --------------------------- Write files ----------------------
Path(OUTPUT_SQL).parent.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Write the big combined file (optional but useful)
Path(OUTPUT_SQL).write_text("\n\n".join(lines), encoding="utf-8")

# Build per-part files (each with its own header + transaction)
def chunk_header():
    return [
        r"\set ON_ERROR_STOP on",
        # r"\set ECHO all",  # uncomment for verbose echo
        "-- AUTOGENERATED SQL for Customer Orders/Lots/Shipments/Invoices",
        "BEGIN;",
    ]

def chunk_footer():
    return ["COMMIT;"]

files_written = []
buf = chunk_header()
rows_in_current = 0
file_idx = 1

def flush_chunk():
    global buf, rows_in_current, file_idx
    if rows_in_current == 0:
        return
    content = buf + chunk_footer()
    out_path = OUT_DIR / f"{BASE_NAME}_{file_idx:03}.sql"
    out_path.write_text("\n\n".join(content), encoding="utf-8")
    files_written.append(str(out_path))
    file_idx += 1
    rows_in_current = 0
    buf = chunk_header()

# Walk the original lines; skip global BEGIN/COMMIT/meta; split at row boundaries
i = 0
while i < len(lines):
    line = lines[i]

    if line.startswith("-- __ROW_BOUNDARY__"):
        if rows_in_current >= ROWS_PER_FILE:
            flush_chunk()
        rows_in_current += 1
        i += 1
        continue

    # Skip global wrappers/meta; each chunk has its own
    ls = line.strip()
    if ls in {"BEGIN;", "COMMIT;"} or ls.startswith(r"\set "):
        i += 1
        continue

    buf.append(line)
    i += 1

# Flush remaining
flush_chunk()

# Runner that includes each part
with RUN_ALL_FILE.open("w", encoding="utf-8") as f:
    f.write(r"\set ON_ERROR_STOP on" + "\n")
    for p in files_written:
        f.write(rf"\i '{p.replace('\\', '/')}'" + "\n")

# Debug JSON (plus parts)
diag = {
    "sheet_used": sheet_to_use,
    "original_columns": list(map(str, df_raw.columns)),
    "normalized_columns": list(map(str, df.columns)),
    "emitted_rows": emitted,
    "skipped": skipped,
    "parts": files_written,
    "combined_sql": OUTPUT_SQL,
    "run_all": str(RUN_ALL_FILE),
}
Path(DEBUG_JSON).write_text(json.dumps(diag, indent=2), encoding="utf-8")

print(f"[OK] wrote combined SQL -> {OUTPUT_SQL}")
print(f"[OK] wrote {len(files_written)} part files -> {OUT_DIR}")
print(f"[Runner] -> {RUN_ALL_FILE}")
print(f"[Preview] -> {PREVIEW_CSV}")
print(f"[Debug]   -> {DEBUG_JSON}")
print(f"Emitted rows: {emitted} | Skipped: {skipped}")
