# preview_excel.py
import pandas as pd

def find_header_row(df):
    # หาแถวที่มีคีย์เวิร์ดสำคัญ ๆ
    keys = {"Lot Number", "PO Number", "PO Date", "Qty PO", "Shipped / Date"}
    for i in range(min(20, len(df))):
        rowvals = set(str(x).strip() for x in df.iloc[i].tolist())
        if len(keys & rowvals) >= 2:   # เจอหัวตาราง
            return i
    return 0

def load_excel(path, sheet):
    raw = pd.read_excel(path, sheet_name=sheet, header=None, engine="openpyxl")
    hdr = find_header_row(raw)
    df = pd.read_excel(path, sheet_name=sheet, header=hdr, engine="openpyxl")
    # ทำความสะอาดคอลัมน์
    df.columns = [str(c).strip() for c in df.columns]
    return df

def preview_rows(df, n=10):
    # เลือกคอลัมน์ที่สนใจ
    cols = [c for c in ["Lot Number", "PO Number", "PO Date", 
                        "Qty PO", "Shipped / Date", "Qty Shipped"] if c in df.columns]
    print(df[cols].head(n))

if __name__ == "__main__":
    path = "C:/Users/Tanapon/Downloads/2040364-1.xlsm"
    sheet = "2040364-1"

    df = load_excel(path, sheet)
    print("=== Columns ===")
    print(df.columns.tolist())
    print("\n=== Preview Data ===")
    preview_rows(df, n=10)

