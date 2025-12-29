DROP VIEW IF EXISTS v_lot_summary CASCADE;

CREATE OR REPLACE VIEW v_lot_summary AS
SELECT
    -- ===== LOT =====
    pl.id AS lot_id,
    pl.lot_no,
    pl.status AS lot_status,
    pl.planned_qty AS lot_qty,
    pl.lot_due_date,
    pl.created_at,
    pl.lot_po_date,
    pl.fair_note,
    pl.note,

    -- ===== PART =====
    pt.id AS part_id,
    pt.part_no,
    pt.name AS part_name,

    -- ===== REVISION =====
    pr.id AS revision_id,
    pr.rev AS revision_code,

    -- ===== PO =====
    po.id AS po_id,
    po.po_number,
    po.customer_id,

    -- ===== CUSTOMER =====
    c.code AS customer_code,
    c.name AS customer_name,

    -- ===== PO-LINE =====
    pol.id AS po_line_id,
    pol.qty_ordered AS po_qty_total,
    pol.due_date AS po_due_date,
    (pol.due_date::date - CURRENT_DATE) AS days_left,

    -- ===== TRAVELER =====
    st.id AS traveler_id,

    -- ===== MATERIAL / BATCH =====
    mb.batch_no_list,

    -- ===== SHIPMENT (LOT-based aggregate) =====
    COALESCE(sh.shipped_qty_total, 0) AS lot_shipped_qty,
    COALESCE(sh.shipped_qty_total, 0) AS po_shipped_total,

    (pol.qty_ordered - COALESCE(sh.shipped_qty_total, 0)) AS po_remaining_qty,

    sh.last_ship_date,
    sh.shipped_qty_list,
    sh.shipped_at_list,
    sh.tracking_no_list,

    -- ===== SHIPMENT STATUS =====
    CASE
        WHEN pol.qty_ordered IS NULL OR pol.qty_ordered = 0
            THEN 'Invalid'

        WHEN (pol.qty_ordered - COALESCE(sh.shipped_qty_total, 0)) < 0
            THEN 'Overshipped'

        WHEN COALESCE(sh.shipped_qty_total, 0) = 0
            THEN 'Not Shipped'

        WHEN (pol.qty_ordered - COALESCE(sh.shipped_qty_total, 0)) = 0
            THEN 'Fully Shipped'

        ELSE 'Partially Shipped'
    END AS shipment_status

FROM production_lots pl

JOIN purchase_orders po
      ON po.id = pl.po_id

LEFT JOIN customers c
      ON c.id = po.customer_id

LEFT JOIN po_lines pol
      ON pol.po_id = po.id
     AND pol.part_id = pl.part_id

LEFT JOIN parts pt
      ON pt.id = pl.part_id

LEFT JOIN part_revisions pr
      ON pr.id = pl.part_revision_id

LEFT JOIN shop_travelers st
      ON st.lot_id = pl.id

-- ===== MATERIAL / BATCH =====
LEFT JOIN LATERAL (
    SELECT
        string_agg(DISTINCT rb.batch_no, ', ' ORDER BY rb.batch_no) AS batch_no_list
    FROM lot_material_use lmu
    JOIN raw_batches rb
         ON rb.id = lmu.batch_id
    WHERE lmu.lot_id = pl.id
) mb ON TRUE

-- ===== SHIPMENT =====
LEFT JOIN LATERAL (
    SELECT
        SUM(csi.qty) AS shipped_qty_total,

        MAX(cs.shipped_at) AS last_ship_date,

        string_agg(csi.qty::text, ', ' ORDER BY cs.shipped_at) AS shipped_qty_list,

        string_agg(
            to_char(cs.shipped_at, 'YYYY-MM-DD'),
            ', '
            ORDER BY cs.shipped_at
        ) AS shipped_at_list,

        string_agg(cs.tracking_no, ', ' ORDER BY cs.shipped_at) AS tracking_no_list

    FROM customer_shipment_items csi
    JOIN customer_shipments cs
         ON cs.id = csi.shipment_id
    WHERE csi.lot_id = pl.id
) sh ON TRUE;
