DROP VIEW IF EXISTS v_lot_summary CASCADE;

CREATE OR REPLACE VIEW v_lot_summary AS
SELECT
    -- LOT
    pl.id AS lot_id,
    pl.lot_no,
    pl.planned_qty AS lot_qty,
    pl.lot_due_date,
    pl.created_at,
    pl.lot_po_date,
    pl.fair_note,

    -- PART
    pt.id AS part_id,
    pt.part_no,
    pt.name AS part_name,

    -- REVISION
    pr.id AS revision_id,
    pr.rev AS revision_code,

    -- PO
    po.id AS po_id,
    po.po_number,
    po.customer_id,

    -- CUSTOMER
    c.code AS customer_code,
    c.name AS customer_name,

    -- PO-LINE
    pol.qty_ordered AS po_qty,
    pol.due_date AS po_due_date,

    -- TRAVELER
    st.id AS traveler_id,

    -- SHIPMENT (AGGREGATED, ONE ROW PER LOT)
    COALESCE(sh.shipped_qty_total, 0) AS shipped_qty_total,
    sh.shipped_qty_list,
    sh.shipped_at_list,
    sh.tracking_no_list

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

-- ⭐ SHIPMENT AGGREGATION
LEFT JOIN LATERAL (
    SELECT
        -- รวม shipped qty ทั้ง lot
        SUM(csi.qty) AS shipped_qty_total,

        -- แยก shipped qty ตาม shipment
        string_agg(
            csi.qty::text,
            ', '
            ORDER BY cs.shipped_at
        ) AS shipped_qty_list,

        -- รวม shipped_at
        string_agg(
            to_char(cs.shipped_at, 'YYYY-MM-DD'),
            ', '
            ORDER BY cs.shipped_at
        ) AS shipped_at_list,

        -- รวม tracking_no
        string_agg(
            cs.tracking_no,
            ', '
            ORDER BY cs.shipped_at
        ) AS tracking_no_list

    FROM customer_shipment_items csi
    JOIN customer_shipments cs
         ON cs.id = csi.shipment_id
    WHERE csi.lot_id = pl.id
) sh ON TRUE;
