DROP VIEW IF EXISTS v_po_summary_shipment;

CREATE VIEW v_po_summary_shipment AS
WITH
-- 1️⃣ total ordered per PO
po_line_totals AS (
    SELECT
        po_id,
        SUM(qty_ordered) AS total_ordered
    FROM po_lines
    GROUP BY po_id
),

-- 2️⃣ shipped qty per PO (historical fact)
shipment_totals AS (
    SELECT
        pl.po_id,
        SUM(csi.qty) AS total_shipped,
        MAX(cs.shipped_at) AS last_ship_date
    FROM production_lots pl
    JOIN customer_shipment_items csi ON csi.lot_id = pl.id
    JOIN customer_shipments cs ON cs.id = csi.shipment_id
    GROUP BY pl.po_id
),

-- 3️⃣ shipped qty per PO line
po_line_shipped AS (
    SELECT
        pol.id AS po_line_id,
        pol.po_id,
        pol.qty_ordered,
        COALESCE(SUM(csi.qty), 0) AS shipped_qty
    FROM po_lines pol
    LEFT JOIN production_lots pl ON pl.po_line_id = pol.id
    LEFT JOIN customer_shipment_items csi ON csi.lot_id = pl.id
    GROUP BY
        pol.id,
        pol.po_id,
        pol.qty_ordered
),

-- 4️⃣ 🔜 NEXT DUE DATE (planned) from po_line.due_date
next_due_by_po AS (
    SELECT
        pol.po_id,
        MIN(pol.due_date) AS next_due_date
    FROM po_lines pol
    JOIN po_line_shipped pls ON pls.po_line_id = pol.id
    WHERE pls.shipped_qty < pol.qty_ordered
      AND pol.due_date IS NOT NULL
    GROUP BY pol.po_id
)

SELECT
    po.id AS po_id,
    po.po_number,
    cu.name AS customer_name,
    cu.code as customer_code,

    -- part list
    STRING_AGG(DISTINCT p.part_no, ', ' ORDER BY p.part_no) AS part_nos,

    -- totals
    plt.total_ordered,
    COALESCE(st.total_shipped, 0) AS total_shipped,
    plt.total_ordered - COALESCE(st.total_shipped, 0) AS total_remaining,

    -- shipment status (actual)
    CASE
        WHEN COALESCE(st.total_shipped, 0) = 0 THEN 'Not Shipped'
        WHEN COALESCE(st.total_shipped, 0) < plt.total_ordered THEN 'Partially Shipped'
        ELSE 'Fully Shipped'
    END AS po_shipment_status,

    -- shipped percent
    ROUND(
        COALESCE(st.total_shipped, 0)::numeric
        / NULLIF(plt.total_ordered, 0) * 100,
        2
    ) AS shipped_percent,

    -- dates
    st.last_ship_date,
    nd.next_due_date,

    -- ✅ FIX: integer days only (no interval)
    (DATE(nd.next_due_date) - CURRENT_DATE) AS days_to_next_due,

    CASE
        WHEN nd.next_due_date IS NULL THEN 'Completed'
        WHEN nd.next_due_date < CURRENT_DATE THEN 'Overdue'
        ELSE 'On Track'
    END AS next_due_status

FROM purchase_orders po
JOIN customers cu ON cu.id = po.customer_id

-- safe joins
JOIN po_line_totals plt ON plt.po_id = po.id
LEFT JOIN shipment_totals st ON st.po_id = po.id
LEFT JOIN next_due_by_po nd ON nd.po_id = po.id

-- for part list only
JOIN po_lines pol ON pol.po_id = po.id
JOIN parts p ON p.id = pol.part_id

GROUP BY
    po.id,
    po.po_number,
    cu.name,
    cu.code,
    plt.total_ordered,
    st.total_shipped,
    st.last_ship_date,
    nd.next_due_date;
