DROP VIEW IF EXISTS v_lot_shipment_status;

CREATE OR REPLACE VIEW v_lot_shipment_status AS
SELECT
    pl.id AS lot_id,
    pl.lot_no,
    -- ✅ include IDs for linking
    p.id AS part_id,
    pr.id AS part_revision_id,
    cu.id AS customer_id,
    -- existing display columns
    p.part_no,
    p.name AS part_name,
    pr.rev AS revision,
    po.po_number,
    cu.name AS customer_name,
    pol.due_date,
    pl.planned_qty,
    -- shipment calculations
    COALESCE(SUM(csi.qty), 0) AS qty_shipped,
    (pl.planned_qty - COALESCE(SUM(csi.qty), 0)) AS qty_remaining,
    CASE
        WHEN SUM(csi.qty) IS NULL OR SUM(csi.qty) = 0 THEN 'Not Shipped'
        WHEN SUM(csi.qty) < pl.planned_qty THEN 'Partially Shipped'
        ELSE 'Fully Shipped'
    END AS shipment_status,
    MAX(cs.shipped_at) AS last_ship_date
FROM production_lots pl
JOIN po_lines pol ON pl.po_line_id = pol.id
JOIN purchase_orders po ON pol.po_id = po.id
JOIN customers cu ON po.customer_id = cu.id
JOIN parts p ON pol.part_id = p.id
LEFT JOIN part_revisions pr ON pol.revision_id = pr.id
LEFT JOIN customer_shipment_items csi ON csi.lot_id = pl.id
LEFT JOIN customer_shipments cs ON cs.id = csi.shipment_id
GROUP BY
    pl.id,
    pl.lot_no,
    p.id,
    p.part_no,
    p.name,
    pr.id,
    pr.rev,
    cu.id,
    cu.name,
    po.po_number,
    pol.due_date,
    pl.planned_qty;
