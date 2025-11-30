CREATE OR REPLACE VIEW v_lot_summary2 AS
SELECT
    -- LOT
    pl.id AS lot_id,
    pl.lot_no,
    pl.planned_qty AS lot_qty,
    pl.lot_due_date,

    -- PART
    p.id AS part_id,
    p.part_no,
    p.name AS part_name,

    -- REVISION
    pr.id AS revision_id,
    pr.rev AS revision_code,
    pr.is_current,

    -- PURCHASE ORDER
    po.id AS po_id,
    po.po_number,
    po.customer_id,

    -- PO LINE
    line.qty_ordered AS ordered_qty,
    line.due_date AS po_due_date,

    -- 🔥 แสดง qty จาก CustomerShipmentItem แบบไม่ SUM
    COALESCE(ship.qty, 0) AS ship_qty,

    -- lot ที่ถูก allocate (มาจาก detail row)
    ship.lot_id AS lot_allocate,

    -- traveler
    st.id AS traveler_id,
    st.status AS traveler_status

FROM production_lots pl
JOIN parts p ON p.id = pl.part_id
LEFT JOIN part_revisions pr ON pr.id = pl.part_revision_id
LEFT JOIN purchase_orders po ON po.id = pl.po_id
LEFT JOIN po_lines line ON line.id = pl.po_line_id
LEFT JOIN shop_travelers st ON st.lot_id = pl.id

-- 🎯 JOIN shipment item ล่าสุดของ lot นั้น
LEFT JOIN customer_shipment_items ship
    ON ship.lot_id = pl.id
    AND ship.id = (
        SELECT MAX(id) FROM customer_shipment_items WHERE lot_id = pl.id
    );
