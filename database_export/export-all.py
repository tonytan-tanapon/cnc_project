#!/usr/bin/env python3
"""
Fixed configuration version of export_csv.py
Exports selected tables (or all) from your Postgres DB to CSV
in a timestamped subfolder inside the chosen output directory.
"""

import csv
import math
import os
from datetime import datetime
from decimal import Decimal
import pandas as pd
from sqlalchemy import create_engine, text as sqla_text, inspect
from sqlalchemy.engine import Engine


# ====================================================
# === FIXED SETTINGS (you can change these) ==========
# ====================================================

DATABASE_URL = "postgresql+psycopg2://postgres:1234@localhost:5432/mydb"
OUTPUT_DIR = r"C:\Users\TPSERVER\backup"          # destination directory
EXPORT_ALL_TABLES = True         # True = export everything
TABLES_TO_EXPORT = ["break_entries"]  # list of table names to export
SCHEMA = "public"
CHUNK_SIZE = 50000
# ====================================================


def ts_folder(now=None) -> str:
    now = now or datetime.now()
    return now.strftime("%Y%m%d%H%M")


def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def _is_null(v) -> bool:
    # Safely detect None/NaN/NaT
    if v is None:
        return True
    try:
        # covers float NaN and pandas NaT
        return pd.isna(v)
    except Exception:
        return False

def format_dt(val: object) -> str:
    """Format datetimes like: 2025-09-11 23:22:54.080 -0700 (ms precision)."""
    if _is_null(val):
        return ""
    # Normalize to a Python datetime
    if isinstance(val, pd.Timestamp):
        dt = val.to_pydatetime()
    elif isinstance(val, datetime):
        dt = val
    else:
        # Fallback (strings or other types)
        return str(val)

    # Keep milliseconds
    base = dt.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]  # trim to ms
    tz = dt.strftime("%z") or ""
    return f"{base} {tz}".rstrip()


def normalize_chunk(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df

    out = df.copy()
    for col in out.columns:
        s = out[col]

        # Booleans -> "true"/"false"
        if pd.api.types.is_bool_dtype(s):
            out[col] = s.map(lambda x: "true" if x else "false")
            continue

        # Any datetime-like (with or without tz) -> formatted string
        if pd.api.types.is_datetime64_any_dtype(s) or s.dtype.kind in ("M",):  # covers datetimes/NaT
            out[col] = s.map(format_dt)
            continue

        # Decimal columns -> str, others -> "" for nulls
        out[col] = s.map(lambda x: "" if _is_null(x) else (str(x) if isinstance(x, (pd.Timestamp,)) else x))

    return out



def export_table(engine: Engine, table: str, out_dir: str, schema: str = "public", chunksize: int = 50_000):
    filename = os.path.join(out_dir, f"{table}.csv")
    query = f'SELECT * FROM "{schema}"."{table}"'
    with engine.connect() as conn, open(filename, "w", newline="", encoding="utf-8") as f:
        writer = None
        for chunk in pd.read_sql(sqla_text(query), conn, chunksize=chunksize):
            norm = normalize_chunk(chunk)
            if writer is None:
                writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
                writer.writerow([str(c) for c in norm.columns])
            writer.writerows(norm.itertuples(index=False, name=None))
    print(f"✓ {table} -> {filename}")


def main():
    engine = create_engine(DATABASE_URL)
    run_folder = ts_folder()
    dest_dir = os.path.join(OUTPUT_DIR, run_folder)
    ensure_dir(dest_dir)

    inspector = inspect(engine)
    if EXPORT_ALL_TABLES:
        tables = inspector.get_table_names(schema=SCHEMA)
    else:
        tables = TABLES_TO_EXPORT

    for t in tables:
        export_table(engine, t, dest_dir, schema=SCHEMA, chunksize=CHUNK_SIZE)

    print(f"\nAll files saved in: {dest_dir}")


if __name__ == "__main__":
    main()
