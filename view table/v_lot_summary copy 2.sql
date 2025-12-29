CREATE OR REPLACE VIEW v_lot_summary AS
SELECT
    ------------------------------------------------
    -- LOT
    ------------------------------------------------
    pl.id AS lot_id,
    pl.lot_no,
    pl.planned_qty AS lot_qty,
    pl.lot_due_date,
    pl.lot_po_date,

    ------------------------------------------------
    -- PART
    ------------------------------------------------
    p.id AS part_id,
    p.part_no,
    p.name AS part_name,

    ------------------------------------------------
    -- REVISION
    ------------------------------------------------
    pr.id AS revision_id,
    pr.rev AS revision_code,
    pr.is_current,

    ------------------------------------------------
    -- PURCHASE ORDER
    ------------------------------------------------
    po.id AS po_id,
    po.po_number,
    po.customer_id,

    ------------------------------------------------
    -- PO LINE
    ------------------------------------------------
    pol.qty_ordered AS po_qty,
    pol.due_date AS po_due_date,

    ------------------------------------------------
    -- SHIPPED QTY (sum from shipment items)
    ------------------------------------------------
    COALESCE(ship.ship_qty, 0) AS ship_qty,

    ------------------------------------------------
    -- TRAVELER
    ------------------------------------------------
    st.id AS traveler_id

FROM production_lots pl

JOIN parts p
      ON p.id = pl.part_id

LEFT JOIN part_revisions pr
      ON pr.id = pl.part_revision_id

LEFT JOIN purchase_orders po
      ON po.id = pl.po_id

LEFT JOIN po_lines pol
      ON pol.id = pl.po_line_id

LEFT JOIN (
    SELECT
        lot_id,
        SUM(qty) AS ship_qty
    FROM customer_shipment_items
    GROUP BY lot_id
) ship
      ON ship.lot_id = pl.id

LEFT JOIN shop_travelers st
      ON st.lot_id = pl.id;
