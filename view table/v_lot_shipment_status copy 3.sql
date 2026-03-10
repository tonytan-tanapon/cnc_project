DROP VIEW IF EXISTS v_lot_shipment_status;

CREATE VIEW v_lot_shipment_status AS
SELECT
    -- ===== LOT =====
    pl.id            AS lot_id,
    pl.lot_no,
    pl.status        AS lot_status,
    pl.lot_po_date,

    -- ===== IDs (ใช้ทำ link frontend) =====
    po.id            AS po_id,
    pol.id           AS po_line_id,
    p.id             AS part_id,
    cu.id            AS customer_id,

    -- ===== PO / PART =====
    po.po_number,
    pol.qty_ordered              AS po_qty_ordered,
    pol.due_date                 AS po_line_due_date,
    (pol.due_date::date - CURRENT_DATE) AS days_left,

    p.part_no,
    p.name         AS part_name,
    pr.rev         AS revision,

    cu.name        AS customer_name,
    cu.code        AS customer_code,

    -- ===== LOT (production only) =====
    pl.planned_qty AS lot_planned_qty,

    -- ===== SHIPMENT (PO-centric) =====
    COALESCE(SUM(csi.qty), 0) AS shipped_qty,   -- ส่งสะสมทุก lot / ทุก shipment

    (pol.qty_ordered - COALESCE(SUM(csi.qty), 0)) AS remain_qty,

    MAX(cs.shipped_at) AS last_ship_date,

    -- ===== SHIPMENT STATUS (based on PO remain) =====
    CASE
        WHEN pol.qty_ordered IS NULL OR pol.qty_ordered = 0
            THEN 'Invalid'

        WHEN (pol.qty_ordered - COALESCE(SUM(csi.qty), 0)) < 0
            THEN 'Overshipped'

        WHEN COALESCE(SUM(csi.qty), 0) = 0
            THEN 'Not Shipped'

        WHEN (pol.qty_ordered - COALESCE(SUM(csi.qty), 0)) = 0
            THEN 'Fully Shipped'

        ELSE 'Partially Shipped'
    END AS shipment_status

FROM production_lots pl
JOIN po_lines pol               ON pl.po_line_id = pol.id
JOIN purchase_orders po         ON pol.po_id = po.id
JOIN customers cu               ON po.customer_id = cu.id
JOIN parts p                    ON pol.part_id = p.id
LEFT JOIN part_revisions pr     ON pol.revision_id = pr.id

LEFT JOIN customer_shipment_items csi ON csi.lot_id = pl.id
LEFT JOIN customer_shipments cs       ON cs.id = csi.shipment_id

GROUP BY
    pl.id, pl.lot_no, pl.status, pl.lot_po_date,
    po.id, pol.id, p.id, cu.id,
    po.po_number,
    pol.qty_ordered, pol.due_date,
    p.part_no, p.name, pr.rev,
    cu.name, cu.code,
    pl.planned_qty;
