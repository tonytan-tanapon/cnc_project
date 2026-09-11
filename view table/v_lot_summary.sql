DROP VIEW IF EXISTS v_lot_summary CASCADE;

CREATE OR REPLACE VIEW v_lot_summary AS

SELECT

    -- =====================
    -- LOT
    -- =====================
    pl.id                  AS lot_id,
    pl.lot_no,
    pl.status              AS lot_status,
    pl.planned_qty         AS lot_qty,
    pl.planned_ship_qty    AS lot_planned_ship_qty,
    pl.lot_po_qty          AS lot_po_qty,
    pl.lot_po_duedate      AS lot_po_duedate,
    pl.lot_due_date,
    pl.created_at,
    pl.lot_po_date,
    pl.fair_note,
    pl.note,

    -- =====================
    -- PART
    -- =====================
    pt.id                  AS part_id,
    pt.part_no,
    pt.name                AS part_name,

    -- =====================
    -- REVISION (LOT vs PO)
    -- =====================
    pr.id                  AS lot_revision_id,
    pr.rev                 AS lot_revision_code,

    pr_po.id               AS po_revision_id,
    pr_po.rev              AS po_revision_code,

    -- MAIN REVISION
    COALESCE(pr_po.id, pr.id) AS revision_id,
    COALESCE(pr_po.rev, pr.rev) AS revision_code,

    CASE
        WHEN pr_po.rev IS NOT NULL
         AND pr.rev IS NOT NULL
         AND pr_po.rev != pr.rev
        THEN 'Mismatch'
        ELSE 'OK'
    END AS revision_check,

    -- =====================
    -- PO / CUSTOMER
    -- =====================
    po.id                  AS po_id,
    po.po_number,
    po.customer_id,

    c.code                 AS customer_code,
    c.name                 AS customer_name,

    -- =====================
    -- PO LINE
    -- =====================
    pol.id                 AS po_line_id,

    -- NEW:
    -- Sum lot_po_qty ของทุก LOT ใน PO LINE เดียวกัน
    COALESCE(poq.po_qty_total, 0) AS po_qty_total,

    pol.due_date           AS po_due_date,

    (pol.due_date::date - CURRENT_DATE) AS days_left,

    -- =====================
    -- TRAVELER
    -- =====================
    st.id                  AS traveler_id,

    -- =====================
    -- MATERIAL / BATCH
    -- =====================
    mb.batch_id_list,
    mb.batch_no_list,

    -- =====================
    -- LOT SHIPMENT SUMMARY
    -- =====================

    -- จำนวนที่ ship ของ LOT นี้
    COALESCE(lsh.shipped_qty, 0) AS lot_shipped_qty,

    -- จำนวนคงเหลือของ LOT นี้
    (
        COALESCE(pl.lot_po_qty, 0)
        - COALESCE(lsh.shipped_qty, 0)
    ) AS lot_remaining_to_ship,

    lsh.last_ship_date AS lot_last_ship_date,

    -- =====================
    -- LOT SHIPMENT DETAIL
    -- ล่าสุด
    -- =====================
    lsd.shipped_at     AS lot_shipped_at,
    lsd.tracking_no    AS lot_tracking_no,
    lsd.shipped_qty    AS lot_shipped_qty_last,

    -- =====================
    -- PO SHIPMENT SUMMARY
    -- =====================

    -- จำนวนที่ ship ทั้งหมดของ PO LINE นี้
    COALESCE(psh.shipped_qty_total, 0) AS po_shipped_total,

    -- PO QTY - จำนวนที่ ship แล้ว
    (
        COALESCE(poq.po_qty_total, 0)
        - COALESCE(psh.shipped_qty_total, 0)
    ) AS po_remaining_qty,

    psh.last_ship_date AS po_last_ship_date,

    -- =====================
    -- SHIPMENT STATUS
    -- =====================
    CASE

        WHEN COALESCE(poq.po_qty_total, 0) = 0
        THEN 'Invalid'

        WHEN (
            COALESCE(poq.po_qty_total, 0)
            - COALESCE(psh.shipped_qty_total, 0)
        ) < 0
        THEN 'Overshipped'

        WHEN COALESCE(psh.shipped_qty_total, 0) = 0
        THEN 'Not Shipped'

        WHEN (
            COALESCE(poq.po_qty_total, 0)
            - COALESCE(psh.shipped_qty_total, 0)
        ) = 0
        THEN 'Fully Shipped'

        ELSE 'Partially Shipped'

    END AS shipment_status


FROM production_lots pl


-- =====================
-- PO / CUSTOMER
-- =====================
JOIN purchase_orders po
    ON po.id = pl.po_id

LEFT JOIN customers c
    ON c.id = po.customer_id


-- =====================
-- PO LINE
-- =====================
LEFT JOIN po_lines pol
    ON pol.id = pl.po_line_id


-- =====================
-- PART
-- =====================
LEFT JOIN parts pt
    ON pt.id = pl.part_id


-- =====================
-- LOT REVISION
-- =====================
LEFT JOIN part_revisions pr
    ON pr.id = pl.part_revision_id


-- =====================
-- PO REVISION
-- =====================
LEFT JOIN part_revisions pr_po
    ON pr_po.id = pol.revision_id


-- =====================
-- TRAVELER
-- =====================
LEFT JOIN shop_travelers st
    ON st.lot_id = pl.id


-- =====================
-- PO QTY
-- Sum lot_po_qty
-- ของทุก LOT ใน PO LINE เดียวกัน
-- =====================
LEFT JOIN LATERAL (

    SELECT
        SUM(
            COALESCE(pl2.lot_po_qty, 0)
        ) AS po_qty_total

    FROM production_lots pl2

    WHERE pl2.po_line_id = pol.id

) poq ON TRUE


-- =====================
-- MATERIAL / BATCH
-- =====================
LEFT JOIN LATERAL (

    SELECT
        string_agg(
            id::text,
            ','
            ORDER BY id
        ) AS batch_id_list,

        string_agg(
            batch_no,
            ', '
            ORDER BY batch_no
        ) AS batch_no_list

    FROM (

        SELECT DISTINCT
            rb.id,
            rb.batch_no

        FROM lot_material_use lmu

        JOIN raw_batches rb
            ON rb.id = lmu.batch_id

        WHERE lmu.lot_id = pl.id

    ) x

) mb ON TRUE


-- =====================
-- LOT SHIPMENT SUMMARY
-- shipment ของ LOT นี้
-- =====================
LEFT JOIN LATERAL (
    SELECT
        SUM(csi.qty) AS shipped_qty,
        MAX(cs.shipped_at) AS last_ship_date
    FROM customer_shipment_items csi
    JOIN customer_shipments cs
        ON cs.id = csi.shipment_id
    WHERE csi.lot_id = pl.id
      AND LOWER(pl.status) IN ('shipped', 'completed')
) lsh ON TRUE


-- =====================
-- LOT SHIPMENT DETAIL
-- shipment ล่าสุดของ LOT
-- =====================
LEFT JOIN LATERAL (

    SELECT
        cs.shipped_at,
        cs.tracking_no,
        csi.qty AS shipped_qty

    FROM customer_shipment_items csi

    JOIN customer_shipments cs
        ON cs.id = csi.shipment_id

    WHERE csi.lot_id = pl.id

    ORDER BY
        cs.shipped_at DESC NULLS LAST,
        cs.id DESC

    LIMIT 1

) lsd ON TRUE


-- =====================
-- PO SHIPMENT SUMMARY
-- shipment ทั้งหมดของ PO LINE
-- =====================
LEFT JOIN LATERAL (
    SELECT
        SUM(csi.qty) AS shipped_qty_total,
        MAX(cs.shipped_at) AS last_ship_date

    FROM customer_shipment_items csi

    JOIN customer_shipments cs
        ON cs.id = csi.shipment_id

    JOIN production_lots pl2
        ON pl2.id = csi.lot_id

    WHERE pl2.po_line_id = pol.id
      AND LOWER(pl2.status) IN ('shipped', 'completed')

) psh ON TRUE;