DROP VIEW IF EXISTS v_lot_shipment_status;

CREATE VIEW v_lot_shipment_status AS
WITH base AS (
    SELECT
        pl.id AS lot_id,
        pl.lot_no,
        pl.status AS lot_status,
        pl.lot_po_date,
        pl.lot_po_duedate,
        pl.planned_qty,
        pl.planned_ship_qty AS lot_planned_ship_qty,  -- ✅ alias

        po.id AS po_id,
        po.po_number,
        pol.id AS po_line_id,
        pol.qty_ordered AS po_qty_total,
        pol.due_date AS po_line_due_date,

        cu.id AS customer_id,         -- ✅ ADD
cu.name AS customer_name,
cu.code AS customer_code,

p.id AS part_id,
p.part_no,
p.name AS part_name,
pr.id AS part_revision_id,   -- ✅ ADD
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
    pl.planned_qty, pl.planned_ship_qty,
    po.id, po.po_number,
    pol.id, pol.qty_ordered, pol.due_date,
    cu.id, cu.name, cu.code,
    p.id, p.part_no, p.name,
    pr.id, pr.rev
)

SELECT
    b.*,

    -- shipped total per PO line
    SUM(b.lot_shipped_qty)
        OVER (PARTITION BY b.po_line_id)
        AS po_shipped_total,

    -- remaining qty per PO
    b.po_qty_total
      - SUM(b.lot_shipped_qty)
        OVER (PARTITION BY b.po_line_id)
        AS po_remaining_qty,

    -- shipment status
    CASE
        WHEN SUM(b.lot_shipped_qty)
             OVER (PARTITION BY b.po_line_id) = 0
            THEN 'Not Shipped'

        WHEN SUM(b.lot_shipped_qty)
             OVER (PARTITION BY b.po_line_id) < b.po_qty_total
            THEN 'Partially Shipped'

        WHEN SUM(b.lot_shipped_qty)
             OVER (PARTITION BY b.po_line_id) = b.po_qty_total
            THEN 'Fully Shipped'

        ELSE 'Overshipped'
    END AS lot_shipment_status,

    -- PO days left
    (b.po_line_due_date::date - CURRENT_DATE) AS po_days_left,

    -- Lot PO due date days left
    (b.lot_po_duedate::date - CURRENT_DATE) AS lot_po_days_left

FROM base b;
