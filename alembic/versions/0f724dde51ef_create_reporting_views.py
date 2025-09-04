"""create reporting views /

Revision ID: 0f724dde51ef
Revises: 38136817bdd1
Create Date: 2025-09-03 22:06:44.513112

"""
from typing import Sequence, Union
from pathlib import Path
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0f724dde51ef'
down_revision: Union[str, Sequence[str], None] = '38136817bdd1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# โฟลเดอร์เดียวกับไฟล์ migration นี้
BASE = Path(__file__).resolve().parent

# โฟลเดอร์ย่อยชื่อตรงกับ revision (เก็บ .sql ของ revision นี้)
SQL_DIR = BASE / revision
# print(SQL_DIR)
def read_sql(name: str) -> str:
    path = SQL_DIR / name
    print(path)
    return path.read_text(encoding="utf-8")

def upgrade():
    # สร้าง/อัปเดตวิวตามไฟล์ .sql
    op.execute(read_sql("v_po_summary.sql"))
    op.execute(read_sql("v_po_sum2.sql"))

def downgrade():
    # ลบวิวตอน rollback
    op.execute("DROP VIEW IF EXISTS v_po_summary;")
