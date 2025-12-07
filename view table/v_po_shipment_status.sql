DROP VIEW IF EXISTS v_po_summary_shipment;

CREATE VIEW v_po_summary_shipment AS
SELECT
    po.id AS po_id,
    po.po_number,
    cu.name AS customer_name,

    -- total qty across all PO lines
    SUM(pol.qty_ordered) AS total_ordered,

    -- total shipped qty across all LOTs in that PO
    COALESCE(SUM(csi.qty), 0) AS total_shipped,

    -- remaining
    (SUM(pol.qty_ordered) - COALESCE(SUM(csi.qty), 0)) AS total_remaining,

    -- shipment status
    CASE
        WHEN COALESCE(SUM(csi.qty), 0) = 0 THEN 'Not Shipped'
        WHEN COALESCE(SUM(csi.qty), 0) < SUM(pol.qty_ordered) THEN 'Partially Shipped'
        ELSE 'Fully Shipped'
    END AS po_shipment_status,

    -- % shipped
    ROUND(
        (COALESCE(SUM(csi.qty), 0)::numeric / NULLIF(SUM(pol.qty_ordered), 0)) * 100,
        2
    ) AS shipped_percent,

    -- last ship date across all customer shipments
    MAX(cs.shipped_at) AS last_ship_date

FROM purchase_orders po
JOIN customers cu ON po.customer_id = cu.id
JOIN po_lines pol ON pol.po_id = po.id
LEFT JOIN production_lots pl ON pl.po_line_id = pol.id
LEFT JOIN customer_shipment_items csi ON csi.lot_id = pl.id
LEFT JOIN customer_shipments cs ON cs.id = csi.shipment_id

GROUP BY
    po.id, po.po_number, cu.name;
