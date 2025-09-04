"""'create_MV'

Revision ID: 394e71379ae4
Revises: 7c025cfea0bc
Create Date: 2025-09-03 23:08:46.653707

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '394e71379ae4'
down_revision: Union[str, Sequence[str], None] = '7c025cfea0bc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.execute("""
DROP MATERIALIZED VIEW IF EXISTS mv_po_summary;

CREATE MATERIALIZED VIEW mv_po_summary AS
WITH shipped AS (
  SELECT
    csi.po_line_id,
    SUM(csi.qty)::numeric(18,3)    AS qty_shipped,
    MIN(cs.shipped_at)::date       AS first_ship_date,
    MAX(cs.shipped_at)::date       AS last_ship_date
  FROM customer_shipment_items csi
  JOIN customer_shipments cs ON cs.id = csi.shipment_id
  GROUP BY csi.po_line_id
),
invoiced AS (
  SELECT
    cil.po_line_id,
    SUM(cil.qty)::numeric(18,3)    AS qty_invoiced,
    SUM(cil.amount)::numeric(18,2) AS amount_invoiced
  FROM customer_invoice_lines cil
  GROUP BY cil.po_line_id
)
SELECT
  po.id                                    AS po_id,
  po.po_number,
  po.customer_id,
  l.id                                     AS po_line_id,   -- unique key ของ MV
  l.part_id,
  p.part_no,
  pr.rev                                   AS revision,
  l.qty_ordered,
  l.unit_price,
  (l.qty_ordered * COALESCE(l.unit_price,0))::numeric(18,2) AS line_total,
  s.qty_shipped,
  i.qty_invoiced,
  COALESCE(l.qty_ordered - COALESCE(s.qty_shipped,0), l.qty_ordered)::numeric(18,3) AS qty_open,
  i.amount_invoiced,
  s.first_ship_date,
  s.last_ship_date
FROM po_lines l
JOIN purchase_orders po   ON po.id = l.po_id
JOIN parts p              ON p.id  = l.part_id
LEFT JOIN part_revisions pr ON pr.id = l.revision_id
LEFT JOIN shipped s       ON s.po_line_id = l.id
LEFT JOIN invoiced i      ON i.po_line_id = l.id
WITH NO DATA;

CREATE UNIQUE INDEX mv_po_summary_uidx ON mv_po_summary (po_line_id);
""")

    # โหลดข้อมูลครั้งแรกแบบปกติ (ทำใน txn ได้)
    op.execute("REFRESH MATERIALIZED VIEW mv_po_summary;")


def downgrade():
    op.execute("DROP MATERIALIZED VIEW IF EXISTS mv_po_summary CASCADE;")
