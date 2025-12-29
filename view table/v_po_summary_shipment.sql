DROP VIEW IF EXISTS v_po_summary_shipment;

CREATE VIEW v_po_summary_shipment AS
WITH
/* =========================================================
   1) TOTAL ORDERED QTY PER PO
========================================================= */
po_line_totals AS (
    SELECT
        po_id,
        SUM(qty_ordered) AS total_ordered
    FROM po_lines
    GROUP BY po_id
),

/* =========================================================
   2) TOTAL SHIPPED QTY PER PO (HISTORICAL FACT)
========================================================= */
shipment_totals AS (
    SELECT
        cs.po_id,
        SUM(csi.qty)       AS total_shipped,
        MAX(cs.shipped_at) AS last_ship_date
    FROM customer_shipments cs
    JOIN customer_shipment_items csi
        ON csi.shipment_id = cs.id
    GROUP BY cs.po_id
),

/* =========================================================
   3) SHIPPED QTY PER PO LINE
========================================================= */
po_line_shipped AS (
    SELECT
        pol.id AS po_line_id,
        pol.po_id,
        pol.qty_ordered,
        COALESCE(SUM(csi.qty), 0) AS shipped_qty
    FROM po_lines pol
    LEFT JOIN customer_shipment_items csi
        ON csi.po_line_id = pol.id
    GROUP BY
        pol.id,
        pol.po_id,
        pol.qty_ordered
),

/* =========================================================
   4) NEXT DUE DATE (ONLY LINES NOT FULLY SHIPPED)
========================================================= */
next_due_by_po AS (
    SELECT
        pol.po_id,
        MIN(pol.due_date) AS next_due_date
    FROM po_lines pol
    JOIN po_line_shipped pls
        ON pls.po_line_id = pol.id
    WHERE pls.shipped_qty < pol.qty_ordered
      AND pol.due_date IS NOT NULL
    GROUP BY pol.po_id
)

/* =========================================================
   FINAL SELECT (1 ROW PER PO)
========================================================= */
SELECT
    /* ===== PO ===== */
    po.id           AS po_id,
    po.po_number,
    po.customer_id,
    po.po_date,
    po.created_at,

    /* ===== CUSTOMER ===== */
    cu.code         AS customer_code,
    cu.name         AS customer_name,

    /* ===== PART / REV (AGGREGATED) ===== */
    STRING_AGG(
        DISTINCT p.part_no,
        ', '
        ORDER BY p.part_no
    ) AS part_nos,

    STRING_AGG(
        DISTINCT p.id::text,
        ', '
        ORDER BY p.id::text
    ) AS part_ids,

    STRING_AGG(
        DISTINCT pr.id::text,
        ', '
        ORDER BY pr.id::text
    ) AS revision_ids,

    /* ===== QTY ===== */
    plt.total_ordered,
    COALESCE(st.total_shipped, 0) AS total_shipped,
    plt.total_ordered - COALESCE(st.total_shipped, 0) AS total_remaining,

    /* ===== SHIPMENT STATUS ===== */
    CASE
        WHEN COALESCE(st.total_shipped, 0) = 0
            THEN 'Not Shipped'
        WHEN COALESCE(st.total_shipped, 0) < plt.total_ordered
            THEN 'Partially Shipped'
        ELSE 'Fully Shipped'
    END AS po_shipment_status,

    /* ===== SHIPPED PERCENT ===== */
    ROUND(
        COALESCE(st.total_shipped, 0)::numeric
        / NULLIF(plt.total_ordered, 0) * 100,
        2
    ) AS shipped_percent,

    /* ===== DATES ===== */
    st.last_ship_date,
    nd.next_due_date,

    /* integer days only */
    (DATE(nd.next_due_date) - CURRENT_DATE) AS days_to_next_due,

    CASE
        WHEN nd.next_due_date IS NULL THEN 'Completed'
        WHEN nd.next_due_date < CURRENT_DATE THEN 'Overdue'
        ELSE 'On Track'
    END AS next_due_status

FROM purchase_orders po
JOIN customers cu
    ON cu.id = po.customer_id

JOIN po_line_totals plt
    ON plt.po_id = po.id

LEFT JOIN shipment_totals st
    ON st.po_id = po.id

LEFT JOIN next_due_by_po nd
    ON nd.po_id = po.id

/* ===== PART / REV SOURCE ===== */
JOIN po_lines pol
    ON pol.po_id = po.id
JOIN parts p
    ON p.id = pol.part_id
LEFT JOIN part_revisions pr
    ON pr.id = pol.revision_id

GROUP BY
    po.id,
    po.po_number,
    po.customer_id,
    po.po_date,
    po.created_at,
    cu.code,
    cu.name,
    plt.total_ordered,
    st.total_shipped,
    st.last_ship_date,
    nd.next_due_date;
