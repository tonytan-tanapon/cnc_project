"""add production_due_date to shop_travelers

Revision ID: 849107fd04c8
Revises: 7b9ab10e8cdd
Create Date: 2025-09-24 15:49:12.960360

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '849107fd04c8'
down_revision: Union[str, Sequence[str], None] = '7b9ab10e8cdd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.add_column(
        "shop_travelers",
        sa.Column("production_due_date", sa.Date(), nullable=True)
    )
    op.create_index(
        "ix_shop_travelers_production_due_date",
        "shop_travelers",
        ["production_due_date"],
        unique=False
    )

    # (Optional) Backfill from PO Line due_date via Lot → PO Line
    # Works on PostgreSQL (and most SQL DBs that support UPDATE ... FROM).
    op.execute("""
        UPDATE shop_travelers st
        SET production_due_date = pol.due_date
        FROM production_lots pl
        JOIN po_lines pol ON pol.id = pl.po_line_id
        WHERE st.lot_id = pl.id
          AND pol.due_date IS NOT NULL
          AND st.production_due_date IS NULL
    """)

    # (Optional) If you want NOT NULL after backfill, run a data check first,
    # then uncomment the line below:
    # op.alter_column("shop_travelers", "production_due_date", existing_type=sa.Date(), nullable=False)

def downgrade():
    op.drop_index("ix_shop_travelers_production_due_date", table_name="shop_travelers")
    op.drop_column("shop_travelers", "production_due_date")