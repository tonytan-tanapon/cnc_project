"""'create_view'

Revision ID: 7237c9e1943a
Revises: 0f724dde51ef
Create Date: 2025-09-03 22:34:04.295575

"""
from typing import Sequence, Union
from pathlib import Path
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7237c9e1943a'
down_revision: Union[str, Sequence[str], None] = '0f724dde51ef'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


BASE = Path(__file__).resolve().parent
SQL_DIR = BASE / revision

def read_sql(name: str) -> str:
    path = SQL_DIR / name
    if not path.exists():
        # crash พร้อมบอก path ให้รู้ว่ามิ้มพลาด
        raise FileNotFoundError(f"[{revision}] SQL file not found: {path}")
    sql = path.read_text(encoding="utf-8")
    if not sql.strip():
        raise ValueError(f"[{revision}] SQL file is empty: {path}")
    return sql

def upgrade():
    # log เบา ๆ เวลา alembic รัน (จะเห็นใน stdout)
    print(f"[{revision}] SQL_DIR = {SQL_DIR}")
    print(f"[{revision}] Creating/Updating view v_po_summary")
    # op.execute(sa.text(read_sql("v_po_summary.sql")))
    op.execute("""
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

    """)
    # smoke test: select 1
    op.execute(sa.text("SELECT 1"))

def downgrade():
    print(f"[{revision}] Dropping view v_po_summary")
    op.execute(sa.text("DROP VIEW IF EXISTS public.v_po_summary CASCADE;"))
