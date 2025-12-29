DROP VIEW IF EXISTS v_po_summary_shipment CASCADE;

CREATE VIEW v_po_summary_shipment AS
WITH
-- 1️⃣ total ordered per PO
po_totals AS (
    SELECT
        po.id AS po_id,
        SUM(pol.qty_ordered) AS total_po_qty
    FROM purchase_orders po
    JOIN po_lines pol ON pol.po_id = po.id
    GROUP BY po.id
),

-- 2️⃣ shipped qty per PO (FACT from shipment)
po_shipped AS (
    SELECT
        po.id AS po_id,
        SUM(csi.qty) AS total_shipped_qty,
        MAX(cs.shipped_at) AS last_ship_date
    FROM purchase_orders po
    JOIN production_lots pl ON pl.po_id = po.id
    JOIN customer_shipment_items csi ON csi.lot_id = pl.id
    JOIN customer_shipments cs ON cs.id = csi.shipment_id
    GROUP BY po.id
),

-- 3️⃣ next due date (ยังส่งไม่ครบ)
next_due AS (
    SELECT
        po.id AS po_id,
        MIN(pol.due_date) AS next_due_date
    FROM purchase_orders po
    JOIN po_lines pol ON pol.po_id = po.id
    LEFT JOIN production_lots pl ON pl.po_line_id = pol.id
    LEFT JOIN customer_shipment_items csi ON csi.lot_id = pl.id
    GROUP BY po.id, pol.id, pol.qty_ordered
    HAVING COALESCE(SUM(csi.qty),0) < pol.qty_ordered
)

SELECT
    po.id AS po_id,
    po.po_number,

    -- customer
    cu.id AS customer_id,
    cu.name AS customer_name,
    cu.code AS customer_code,

    -- parts (for display / link)
    STRING_AGG(DISTINCT p.part_no, ', ' ORDER BY p.part_no) AS part_nos,
    STRING_AGG(DISTINCT p.id::text, ', ' ORDER BY p.id::text) AS part_ids,
    STRING_AGG(DISTINCT pr.id::text, ', ' ORDER BY pr.id::text) AS revision_ids,

    -- totals (⭐ สิ่งที่คุณถาม)
    pt.total_po_qty,
    COALESCE(ps.total_shipped_qty, 0) AS total_shipped_qty,
    pt.total_po_qty - COALESCE(ps.total_shipped_qty, 0) AS total_remaining_qty,

    -- percent
    ROUND(
        COALESCE(ps.total_shipped_qty, 0)::numeric
        / NULLIF(pt.total_po_qty, 0) * 100,
        2
    ) AS shipped_percent,

    -- dates
    ps.last_ship_date,
    nd.next_due_date,
    (nd.next_due_date - CURRENT_DATE) AS days_to_next_due,

    -- status
    CASE
        WHEN COALESCE(ps.total_shipped_qty,0) = 0 THEN 'Not Shipped'
        WHEN COALESCE(ps.total_shipped_qty,0) < pt.total_po_qty THEN 'Partially Shipped'
        ELSE 'Fully Shipped'
    END AS po_ship_status

FROM purchase_orders po
JOIN customers cu ON cu.id = po.customer_id
JOIN po_lines pol ON pol.po_id = po.id
JOIN parts p ON p.id = pol.part_id
LEFT JOIN part_revisions pr ON pr.id = pol.revision_id

JOIN po_totals pt ON pt.po_id = po.id
LEFT JOIN po_shipped ps ON ps.po_id = po.id
LEFT JOIN next_due nd ON nd.po_id = po.id

GROUP BY
    po.id, po.po_number,
    cu.id, cu.name, cu.code,
    pt.total_po_qty,
    ps.total_shipped_qty,
    ps.last_ship_date,
    nd.next_due_date;
