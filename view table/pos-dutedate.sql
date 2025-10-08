-- View: v_pos_deadlines
-- Logic: for each PO, pick the earliest due date across its lines
-- (use second_due_date if present, else due_date)

CREATE OR REPLACE VIEW v_pos_deadlines AS
SELECT
  p.id                    AS po_id,
  p.po_number,
  p.customer_id,
  c.code                  AS customer_code,
  c.name                  AS customer_name,
  p.created_at,
  MIN(
    COALESCE(
      pl.second_due_date,
      pl.due_date
    )
  )                       AS earliest_due_at,
  COUNT(pl.id)            AS total_lines,
  COUNT(*) FILTER (WHERE COALESCE(pl.second_due_date, pl.due_date) IS NULL)
                          AS lines_without_due,
  COUNT(*) FILTER (
    WHERE COALESCE(pl.second_due_date, pl.due_date) IS NOT NULL
      AND COALESCE(pl.second_due_date, pl.due_date) < NOW()
  )                       AS overdue_lines
FROM purchase_orders p
JOIN customers c ON c.id = p.customer_id
LEFT JOIN po_lines pl ON pl.po_id = p.id
GROUP BY p.id, p.po_number, p.customer_id, c.code, c.name, p.created_at;
