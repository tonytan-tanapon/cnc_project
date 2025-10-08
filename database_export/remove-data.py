from sqlalchemy import create_engine, text

# === Configuration ===
DATABASE_URL = "postgresql+psycopg2://postgres:1234@localhost:5432/mydb"

SQL = """
TRUNCATE TABLE 
public.break_entries,
public.trime_entires
  
RESTART IDENTITY CASCADE;
"""

# SQL = """
# TRUNCATE TABLE 
# public.break_entries,
# public.trime_entires
#   public.shop_traveler_steps,
#   public.shop_travelers,
#   public.production_lots,
#   public.lot_material_use,
#   public.po_lines,
#   public.purchase_orders,
#   public.parts,
#   public.part_revisions,
#   public.raw_batches,
#   public.raw_materials,
#   public.suppliers,
#   public.customers
# RESTART IDENTITY CASCADE;
# """

# ======================

def main():
    engine = create_engine(DATABASE_URL)
    with engine.begin() as conn:
        conn.execute(text(SQL))
    print("✓ Selected tables truncated successfully (identities reset, cascades applied).")

if __name__ == "__main__":
    main()
