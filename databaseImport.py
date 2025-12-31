import pandas as pd
from pathlib import Path
from sqlalchemy import (
    create_engine,
    MetaData,
    Table,
    text,
)

# ================= CONFIG =================

DATABASE_URL = "postgresql+psycopg2://postgres:1234@100.88.56.126:5432/mydb"

# 👇 CHANGE THIS TO YOUR BACKUP FOLDER
BACKUP_DIR = Path(r"C:\Users\TPSERVER\backup\202512251543")

SCHEMA = "public"

# =========================================

# Restore order (FK-safe, schema-aware)
RESTORE_ORDER = [
    # --- Catalog / master ---
    "supplier_mat_category_catalog",
    "supplier_service_catalog",
    "manufacturing_processes",
    "chemical_finishes",
    "permissions",
    "roles",

    # --- Core ---
    "suppliers",
    "customers",
    "employees",
    "machines",
    "measurement_devices",

    # --- Auth ---
    "users",
    "user_roles",
    "role_permissions",

    # --- Materials ---
    "raw_materials",
    "material_pos",
    "material_po_lines",
    "raw_batches",

    # --- Parts ---
    "parts",
    "part_revisions",
    "part_materials",

    # --- Sales ---
    "purchase_orders",
    "po_lines",
    "production_lots",

    # --- Travelers ---
    "shop_travelers",
    "shop_traveler_steps",

    # --- Usage ---
    "lot_material_use",
    "lot_material_use_history",

    # --- Subcon ---
    "subcon_orders",
    "subcon_order_lines",
    "subcon_shipments",
    "subcon_shipment_items",
    "subcon_receipts",
    "subcon_receipt_items",

    # --- QA ---
    "inspection_records",
    "inspection_items",

    # --- Shipping / Invoice ---
    "customer_shipments",
    "customer_shipment_items",
    "customer_invoices",
    "customer_invoice_lines",
    "customer_returns",
    "customer_return_items",

    # --- Time ---
    "pay_periods",
    "time_entries",
    "break_entries",
    "time_leaves",
    "holidays",
    "pay_rates",

    # --- Counters ---
    "doc_counters",
]

# ================= ENGINE =================

engine = create_engine(DATABASE_URL, future=True)

metadata = MetaData(schema=SCHEMA)
metadata.reflect(bind=engine)

# All existing tables in DB
existing_tables = set(metadata.tables.keys())

# ================= FUNCTIONS =================

def truncate_table(conn, table_name):
    if table_name not in existing_tables:
        print(f"⚠️  Skip truncate {table_name} (table does not exist)")
        return

    print(f"🧹 Truncating {table_name}")
    conn.execute(
        text(f'TRUNCATE TABLE public."{table_name}" RESTART IDENTITY CASCADE')
    )

def restore_table(conn, table_name):
    if table_name not in existing_tables:
        print(f"⚠️  Skip restore {table_name} (table does not exist)")
        return

    csv_file = BACKUP_DIR / f"{table_name}.csv"
    if not csv_file.exists():
        print(f"⚠️  Skip {table_name} (no CSV)")
        return

    print(f"⬆️ Restoring {table_name}")

    df = pd.read_csv(csv_file)

    if df.empty:
        print(f"⚠️  {table_name} CSV is empty")
        return

    table = Table(table_name, metadata, autoload_with=engine)
    valid_cols = {c.name for c in table.columns}

    # Drop CSV columns that don't exist in DB
    df = df[[c for c in df.columns if c in valid_cols]]

    if df.empty:
        print(f"⚠️  {table_name} has no matching columns")
        return

    records = df.to_dict(orient="records")
    conn.execute(table.insert(), records)

# ================= MAIN =================

if __name__ == "__main__":
    print("🚨 STARTING FULL DATABASE RESTORE")
    print(f"📂 Backup source: {BACKUP_DIR}")
    print("⚠️  ALL DATA WILL BE DELETED")

    with engine.begin() as conn:
        # Disable FK checks & triggers (PostgreSQL)
        conn.execute(text("SET session_replication_role = replica"))

        for table_name in RESTORE_ORDER:
            truncate_table(conn, table_name)
            restore_table(conn, table_name)

        # Re-enable FK checks
        conn.execute(text("SET session_replication_role = DEFAULT"))

    print("✅ DATABASE RESTORE COMPLETED SUCCESSFULLY")
