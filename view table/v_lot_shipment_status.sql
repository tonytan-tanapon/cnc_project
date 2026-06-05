DROP VIEW IF EXISTS v_lot_shipment_status;

CREATE VIEW v_lot_shipment_status AS

-- =========================
-- base lot + shipment
-- =========================
WITH base AS (
    SELECT
        pl.id AS lot_id,
        pl.lot_no,
        pl.status AS lot_status,
        pl.last_activity,
        pl.lot_po_date,
        pl.lot_po_duedate,
        pl.planned_qty,
        pl.planned_ship_qty AS lot_planned_ship_qty,
        pl.note AS lot_note,

        po.id AS po_id,
        po.po_number,
        pol.id AS po_line_id,
        pol.qty_ordered AS po_qty_total,
        pol.due_date AS po_line_due_date,

        cu.id AS customer_id,
        cu.name AS customer_name,
        cu.code AS customer_code,

        p.id AS part_id,
        p.part_no,
        p.name AS part_name,
        pr.id AS part_revision_id,
        pr.rev AS revision,

        COALESCE(SUM(csi.qty), 0) AS lot_shipped_qty,
        MAX(cs.shipped_at) AS lot_last_ship_date

    FROM production_lots pl
    JOIN po_lines pol ON pl.po_line_id = pol.id
    JOIN purchase_orders po ON pol.po_id = po.id
    JOIN customers cu ON po.customer_id = cu.id
    JOIN parts p ON pol.part_id = p.id
    LEFT JOIN part_revisions pr ON pol.revision_id = pr.id
    LEFT JOIN customer_shipment_items csi ON csi.lot_id = pl.id
    LEFT JOIN customer_shipments cs ON cs.id = csi.shipment_id

    GROUP BY
        pl.id, pl.lot_no, pl.status, pl.lot_po_date, pl.lot_po_duedate,
        pl.last_activity,
        pl.planned_qty, pl.planned_ship_qty,
        pl.note,
        po.id, po.po_number,
        pol.id, pol.qty_ordered, pol.due_date,
        cu.id, cu.name, cu.code,
        p.id, p.part_no, p.name,
        pr.id, pr.rev
),

-- =========================
-- last traveler per lot
-- =========================
last_traveler AS (
    SELECT DISTINCT ON (t.lot_id)
        t.lot_id,
        t.id AS traveler_id
    FROM shop_travelers t
    ORDER BY t.lot_id, t.id DESC
),

-- =========================
-- last step per traveler
-- =========================
last_step AS (
    SELECT DISTINCT ON (s.traveler_id)
        s.id AS step_id,
        s.traveler_id,
        s.status AS step_status
    FROM shop_traveler_steps s
    ORDER BY s.traveler_id, s.seq DESC
),

-- =========================
-- step totals (FROM LOGS)
-- =========================
step_totals AS (
    SELECT
        l.step_id,
        COALESCE(SUM(l.qty_receive), 0) AS qty_receive,
        COALESCE(SUM(l.qty_accept), 0) AS qty_accept,
        COALESCE(SUM(l.qty_reject), 0) AS qty_reject
    FROM shop_traveler_step_logs l
    GROUP BY l.step_id
),

traveler_progress AS (
    SELECT
        st.lot_id,
        ROUND(
            (
                COUNT(*)
                FILTER (
                    WHERE s.status = 'passed'
                )::numeric
                /
                NULLIF(
                    COUNT(*),  0  )
            ) * 100
        ,2) AS progress_percent

    FROM shop_travelers st

    JOIN shop_traveler_steps s
        ON s.traveler_id = st.id

    GROUP BY st.lot_id
),

ecar_parts AS (
    SELECT DISTINCT part_no
    FROM ecars
),
-- =========================
-- final result
-- =========================


icar_parts AS (
    SELECT DISTINCT part_no
    FROM icars
)
SELECT
    b.*,

    COALESCE(
        tp.progress_percent,
        0
    ) AS progress_percent,
    -- =========================
    -- step info (FROM LOGS)
    -- =========================
    ls.step_id,
    COALESCE(st.qty_receive, 0) AS receive_input,
    COALESCE(st.qty_accept, 0) AS accept_input,
    COALESCE(st.qty_reject, 0) AS reject_input,
    ls.step_status,

    -- =========================
    -- PO aggregation
    -- =========================
    COALESCE(
        SUM(b.lot_shipped_qty)
        FILTER (WHERE b.lot_status <> 'not_start')
        OVER (PARTITION BY b.po_line_id),
    0) AS po_shipped_total,

    CASE 
        WHEN b.lot_status = 'not_start' THEN
            b.po_qty_total
            - COALESCE(
                SUM(b.lot_shipped_qty)
                FILTER (WHERE b.lot_status <> 'not_start')
                OVER (PARTITION BY b.po_line_id),0)
        ELSE 0
    END AS po_remaining_qty,

    -- =========================
    -- shipment status
    -- =========================
    CASE
        WHEN COALESCE(
            SUM(b.lot_shipped_qty)
            FILTER (WHERE b.lot_status <> 'not_start')
            OVER (PARTITION BY b.po_line_id),
        0) = 0
            THEN 'Not Shipped'

        WHEN COALESCE(
            SUM(b.lot_shipped_qty)
            FILTER (WHERE b.lot_status <> 'not_start')
            OVER (PARTITION BY b.po_line_id),
        0) < b.po_qty_total
            THEN 'Partially Shipped'

        WHEN COALESCE(
            SUM(b.lot_shipped_qty)
            FILTER (WHERE b.lot_status <> 'not_start')
            OVER (PARTITION BY b.po_line_id),
        0) = b.po_qty_total
            THEN 'Fully Shipped'

        ELSE 'Overshipped'
        
      
    END AS lot_shipment_status,
 CASE
    WHEN ep.part_no IS NOT NULL
    THEN 'Y'
    ELSE 'N'
END AS ecar,

CASE
    WHEN ip.part_no IS NOT NULL
    THEN 'Y'
    ELSE 'N'
END AS icar,

    -- =========================
    -- days calculation
    -- =========================
    (b.po_line_due_date::date - CURRENT_DATE) AS po_days_left,
    (b.lot_po_duedate::date - CURRENT_DATE) AS lot_po_days_left

FROM base b

LEFT JOIN icar_parts ip
    ON ip.part_no = b.part_no
LEFT JOIN ecar_parts ep
    ON ep.part_no = b.part_no

LEFT JOIN traveler_progress tp
    ON tp.lot_id = b.lot_id

LEFT JOIN last_traveler lt
    ON lt.lot_id = b.lot_id

LEFT JOIN last_step ls
    ON ls.traveler_id = lt.traveler_id

LEFT JOIN step_totals st
    ON st.step_id = ls.step_id;