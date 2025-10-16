from sqlalchemy import create_engine, text

# === Configuration ===
DATABASE_URL = "postgresql+psycopg2://postgres:1234@localhost:5432/mydb"

SQL = """
TRUNCATE TABLE 
    public.suppliers,
    public.supplier_service_catalog,
    public.supplier_services,
    public.supplier_mat_category_catalog,
    public.supplier_material_categories,
    public.customers,
    public.purchase_orders,
    public.raw_materials,
    public.material_pos,
    public.material_po_lines,
    public.raw_batches,
    public.parts,
    public.part_revisions,
    public.part_materials,
    public.production_lots,
    public.lot_material_use,
    public.shop_travelers,
    public.shop_traveler_steps,
    public.subcon_orders,
    public.subcon_order_lines,
    public.subcon_shipments,
    public.subcon_shipment_items,
    public.subcon_receipts,
    public.subcon_receipt_items,
    public.machines,
    public.step_machine_options,
    public.machine_schedule,
    public.measurement_devices,
    public.device_calibrations,
    public.inspection_records,
    public.inspection_items,
    public.po_lines,
    public.customer_shipments,
    public.customer_shipment_items,
    public.customer_invoices,
    public.customer_invoice_lines,
    public.customer_returns,
    public.customer_return_items,
    public.mfg_processes,
    public.chemical_finishes,
    public.part_process_selections,
    public.part_finish_selections,
    public.part_other_notes,
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
