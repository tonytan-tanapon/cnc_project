#!/usr/bin/env python3
"""
Import all CSV backups from a folder into Postgres automatically.
Fixed parameters version (no command-line arguments needed).
"""

import os
import sys
import csv
import io
from glob import glob
from typing import List, Tuple, Dict

from decimal import Decimal, InvalidOperation
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
# ==========================================================
# ✅ FIXED CONFIGURATION (you can edit these values)
DATABASE_URL = "postgresql+psycopg2://postgres:1234@localhost:5432/mydb"
FILE_NAME = r"\202510081053"
BACKUP_DIR = r"C:\Users\TPSERVER\backup" + FILE_NAME  # folder containing your CSV files
SCHEMA = "public"
TRUNCATE_FIRST = True
DISABLE_FK = True
# ==========================================================


# Basic PG type families we want to coerce
INT_TYPES = {"smallint", "integer", "bigint"}


def find_csvs(directory: str) -> List[Tuple[str, str]]:
    """Return list of (table, path) pairs for all *.csv in directory."""
    paths = sorted(glob(os.path.join(directory, "*.csv")))
    return [(os.path.splitext(os.path.basename(p))[0], p) for p in paths]


def truncate_tables(engine: Engine, schema: str, tables: List[str]) -> None:
    if not tables:
        return
    fq = [f'"{schema}"."{t}"' for t in tables]
    sql = f"TRUNCATE TABLE {', '.join(fq)} RESTART IDENTITY CASCADE;"
    with engine.begin() as conn:
        conn.execute(text(sql))
    print(f"✓ Truncated {len(tables)} table(s).")


def set_session_replica(engine: Engine, on: bool) -> None:
    """Temporarily disable/enable triggers & FKs for the session (requires superuser)."""
    val = "replica" if on else "DEFAULT"
    with engine.begin() as conn:
        conn.execute(text(f"SET session_replication_role = {val};"))
    if on:
        print("⚠️  Foreign key checks disabled (session_replication_role=replica).")
    else:
        print("↩️  Foreign key checks re-enabled.")


def get_column_types(engine: Engine, schema: str, table: str) -> Dict[str, str]:
    """
    Returns {column_name: data_type} using information_schema.
    e.g., 'integer', 'numeric', 'timestamp with time zone', 'text', ...
    """
    q = text("""
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = :schema AND table_name = :table
        ORDER BY ordinal_position
    """)
    with engine.connect() as conn:
        rows = conn.execute(q, {"schema": schema, "table": table}).fetchall()
    return {r.column_name: r.data_type for r in rows}


def _is_int_like(val: str) -> bool:
    """
    True if val represents an integer (e.g., '59', '59.0', '59.000').
    False for '59.1', 'abc', etc.
    """
    try:
        d = Decimal(val)
    except (InvalidOperation, ValueError):
        return False
    return d == d.to_integral_value()


def _coerce_cell(val: str, pg_type: str) -> str:
    """
    Coerce a single CSV field to be acceptable for COPY into the given pg_type.
    Return empty string to represent NULL (COPY ... NULL '').
    """
    if val is None:
        return ""
    v = val.strip()

    # Empty -> NULL
    if v == "":
        return ""

    # Integers: convert '59.0' -> '59' when it's truly integral
    if pg_type in INT_TYPES:
        if _is_int_like(v):
            return str(int(Decimal(v)))
        # else, pass through; COPY will raise if it's not valid
        return v

    # Other types: leave as-is; Postgres will parse booleans/numerics/timestamps
    return v


def copy_csv(engine: Engine, schema: str, table: str, csv_path: str) -> None:
    """
    Sanitize rows per column types, then COPY with NULL '' so empty cells become SQL NULL.
    """
    # 1) Get column type map from DB
    col_types = get_column_types(engine, schema, table)

    # 2) Read source CSV -> sanitize -> write into in-memory buffer
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n", quoting=csv.QUOTE_MINIMAL)

    with open(csv_path, "r", encoding="utf-8", newline="") as f:
        reader = csv.reader(f)
        try:
            header = next(reader)
        except StopIteration:
            raise RuntimeError(f"{csv_path} is empty")

        writer.writerow(header)

        # Ensure every CSV column exists in the table
        for c in header:
            if c not in col_types:
                raise RuntimeError(f'CSV column "{c}" not found in table {schema}.{table}')

        # Sanitize row-by-row
        for row_idx, row in enumerate(reader, start=2):
            new_row = []
            for c, cell in zip(header, row):
                new_row.append(_coerce_cell(cell, col_types[c]))
            writer.writerow(new_row)

    buf.seek(0)

    # 3) COPY from the in-memory buffer
    cols = ", ".join(f'"{c}"' for c in header)
    copy_sql = (
        f'COPY "{schema}"."{table}" ({cols}) '
        f"FROM STDIN WITH (FORMAT CSV, HEADER TRUE, QUOTE '\"', NULL '')"
    )

    raw = engine.raw_connection()
    try:
        cur = raw.cursor()
        cur.copy_expert(copy_sql, buf)
        raw.commit()
    finally:
        raw.close()

    print(f"✓ Imported {table} ({os.path.basename(csv_path)})")


def fix_sequences(engine: Engine, schema: str) -> None:
    """
    Adjust all sequences for serial/identity columns in the schema so that
    the next INSERT without id will not collide.

    - If table has rows: setval(seq, max_id, true)  -> next nextval = max_id + 1
    - If table is empty: setval(seq, 1, false)      -> next nextval = 1
    """
    q = """
WITH idcols AS (
  SELECT
    n.nspname AS schema_name,
    c.relname AS table_name,
    a.attname AS column_name,
    pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) AS seq_name
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
  WHERE c.relkind = 'r'  -- ordinary tables
    AND n.nspname = :schema
)
SELECT schema_name, table_name, column_name, seq_name
FROM idcols
WHERE seq_name IS NOT NULL
ORDER BY schema_name, table_name, column_name;
"""
    with engine.begin() as conn:
        rows = conn.execute(text(q), {"schema": schema}).fetchall()

        for schema_name, table_name, column_name, seq_name in rows:
            (max_id,) = conn.execute(
                text(f'SELECT MAX("{column_name}") FROM "{schema_name}"."{table_name}"')
            ).one()

            if not max_id or int(max_id) <= 0:
                # Empty table -> nextval should return 1
                conn.execute(
                    text("SELECT setval(:seq::regclass, :val, :is_called)"),
                    {"seq": seq_name, "val": 1, "is_called": False},
                )
                msg = "empty -> nextval=1"
            else:
                # Table has rows -> nextval should return max_id + 1
                conn.execute(
                    text("SELECT setval(:seq::regclass, :val, :is_called)"),
                    {"seq": seq_name, "val": int(max_id), "is_called": True},
                )
                msg = f"max_id={int(max_id)} -> nextval=max_id+1"

            print(f"↪ sequence {seq_name}: {msg}")

    print("✓ Sequences adjusted safely.")


def main() -> None:
    engine = create_engine(DATABASE_URL)

    pairs = find_csvs(BACKUP_DIR)
    if not pairs:
        print(f"No CSVs found in {BACKUP_DIR}")
        sys.exit(1)

    tables = [t for t, _ in pairs]
    print(f"Found {len(tables)} CSV file(s) to import.")

    if TRUNCATE_FIRST:
        truncate_tables(engine, SCHEMA, tables)

    if DISABLE_FK:
        set_session_replica(engine, True)

    for t, path in pairs:
        copy_csv(engine, SCHEMA, t, path)

    if DISABLE_FK:
        set_session_replica(engine, False)

    fix_sequences(engine, SCHEMA)
    print("\n✅ Import completed successfully.")


if __name__ == "__main__":
    main()