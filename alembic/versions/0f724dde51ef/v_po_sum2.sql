-- v_po_summary.sql
CREATE OR REPLACE VIEW public.v_po_sum2 AS
SELECT
  po.po_number,
  c.code  AS customer_code,
  c.name  AS customer_name,
  pl.id   AS po_line_id,
  p.part_no,
  pr.rev  AS part_rev,
  pl.qty_ordered,
  pl.unit_price,
  (pl.qty_ordered * COALESCE(pl.unit_price,0)) AS line_total
FROM purchase_orders po
JOIN customers c       ON c.id = po.customer_id
JOIN po_lines   pl     ON pl.po_id = po.id
JOIN parts      p      ON p.id  = pl.part_id
LEFT JOIN part_revisions pr ON pr.id = pl.revision_id;
-- (ถ้ามี user read-only)
-- GRANT SELECT ON public.v_po_summary TO app_readonly;
