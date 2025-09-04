"""create reporting views

Revision ID: 38136817bdd1
Revises: d3d12ef61259
Create Date: 2025-09-03 22:04:48.219499

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '38136817bdd1'
down_revision: Union[str, Sequence[str], None] = 'd3d12ef61259'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.execute("""
    CREATE OR REPLACE VIEW v_po_summary AS
    SELECT
        po.id              AS po_id,
        po.po_number,
        c.id               AS customer_id,
        c.name             AS customer_name,
        pol.id             AS po_line_id,
        pol.part_id,
        p.part_no,
        pol.qty_ordered,
        pol.due_date,
        COALESCE(SUM(csi.qty), 0) AS qty_shipped
    FROM purchase_orders po
    JOIN customers c          ON c.id = po.customer_id
    LEFT JOIN po_lines pol    ON pol.po_id = po.id
    LEFT JOIN parts p         ON p.id = pol.part_id
    LEFT JOIN customer_shipment_items csi ON csi.po_line_id = pol.id
    GROUP BY po.id, c.id, pol.id, p.id;
    """)

    op.execute("""
    CREATE OR REPLACE VIEW v_test AS
    SELECT
        po.id              AS po_id,
        po.po_number,
        
    FROM purchase_orders po
 ;
    """)

def downgrade():
    op.execute("DROP VIEW IF EXISTS v_po_summary;")
    op.execute("DROP VIEW IF EXISTS v_test;")