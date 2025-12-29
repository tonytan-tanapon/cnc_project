DROP VIEW IF EXISTS v_lot_summary CASCADE;

CREATE OR REPLACE VIEW v_lot_summary AS
SELECT
    -- LOT
    pl.id AS lot_id,
    pl.lot_no,
    pl.planned_qty AS lot_qty,
    pl.lot_due_date,
    pl.created_at,

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

    -- SHIPMENT (CALCULATED)
    COALESCE(sh.shipment_qty, 0) AS ship_qty,
    sh.shipment_date            AS ship_date

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

-- ⭐ SHIPMENT LATERAL: one-to-many lookup, but FAST
LEFT JOIN LATERAL (
    SELECT
        SUM(csi.qty) AS shipment_qty,
        MAX(cs.shipped_at) AS shipment_date
    FROM customer_shipment_items csi
    JOIN customer_shipments cs
         ON cs.id = csi.shipment_id
    WHERE csi.lot_id = pl.id
) sh ON TRUE;
