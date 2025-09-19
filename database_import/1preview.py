import pandas as pd, re, json
from pathlib import Path
from datetime import datetime

EXCEL_PATH = r"C:\Users\TPSERVER\database\Lot_number.xls"
OUTPUT_SQL = r"C:\Users\TPSERVER\database\lot_import.sql"

# --- helper: normalize a header to a compact key like 'partno', 'qtypo', etc.
def norm_header(h):
    return re.sub(r'[^a-z0-9]', '', str(h).strip().lower())

# candidate header keys we will accept -> canonical name we use later
HEADER_MAP = {
    "date": "Date",
    "name": "Customer",
    "lot#": "LotNo", "lotno": "LotNo", "lot": "LotNo",
    "po": "PO",
    "partno.": "PartNo", "partno": "PartNo", "part#": "PartNo", "partnumber": "PartNo",
    "description": "Description",
    "rev.": "Rev", "rev": "Rev",
    "duedate": "DueDate",
    "qtyp o": "QtyPO", "qtypurchaseorder": "QtyPO", "qtypoline": "QtyPO", "qtyp o.": "QtyPO", "qtyp o": "QtyPO",
    "qtypo": "QtyPO",
    "price": "Price",
    "total": "Total",
    "fair#": "FAIR", "fairno": "FAIR", "fair": "FAIR",
    "shippeddate": "ShipDate",
    "qtyshipped": "QtyShipped",
    "invoiceno.": "InvoiceNo", "invoiceno": "InvoiceNo",
    "need/remark": "Remark", "needremark": "Remark", "remark": "Remark",
}

# try to find the sheet that contains a "Lot" or "Part" column
xls = pd.ExcelFile(EXCEL_PATH)
sheet_to_use = None
for sh in xls.sheet_names:
    tmp = pd.read_excel(EXCEL_PATH, sheet_name=sh, nrows=2, header=0, dtype=str)
    keys = [norm_header(c) for c in tmp.columns]
    if any(k.startswith("lot") for k in keys) or any(k.startswith("part") for k in keys):
        sheet_to_use = sh
        break
if sheet_to_use is None:
    # fallback to first sheet
    sheet_to_use = xls.sheet_names[0]

df_raw = pd.read_excel(EXCEL_PATH, sheet_name=sheet_to_use, header=0, dtype=str)

# build a rename dict by normalizing headers
rename = {}
for c in df_raw.columns:
    k = norm_header(c)
    # exact hit
    if k in HEADER_MAP:
        rename[c] = HEADER_MAP[k]
        continue
    # common special-cases: columns with double spaces etc.
    # try fuzzy contains matches
    for key, val in HEADER_MAP.items():
        if k == key:
            rename[c] = val
            break
# apply renames (keep unknown columns as-is)
df = df_raw.rename(columns=rename).copy()

# --- diagnostics: show columns we got and sample rows
diag_path = Path(OUTPUT_SQL).with_suffix(".debug.json")
diag = {
    "sheet_used": sheet_to_use,
    "original_columns": list(map(str, df_raw.columns)),
    "normalized_columns": list(map(str, df.columns)),
}
# write a small CSV preview to inspect quickly
preview_csv = Path(OUTPUT_SQL).with_suffix(".preview.csv")
df.head(30).to_csv(preview_csv, index=False, encoding="utf-8-sig")

# Filter obviously empty rows
def val(r, col):
    return (str(r[col]).strip() if col in df.columns and pd.notna(r[col]) else "")

pre_rows = len(df)
df = df[(df.columns & {"Customer","PartNo","LotNo"}).tolist()] if False else df  # keep all; we’ll skip per-row
post_rows = len(df)

diag["row_counts"] = {"loaded": pre_rows, "after_filter": post_rows}
