"""create/update reporting views

Revision ID: 7c025cfea0bc
Revises: 83c7a679e9d4
Create Date: 2025-09-03 22:53:23.174195

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7c025cfea0bc'
down_revision: Union[str, Sequence[str], None] = '83c7a679e9d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.execute("""
    CREATE OR REPLACE VIEW v_test_c AS
    SELECT
        
        c.id               AS customer_id,
        c.name             AS customer_name
        
    FROM customers c          
    """)

    op.execute("""
    CREATE OR REPLACE VIEW v_test_c2 AS
    SELECT
        
        c.id               AS customer_id,
        c.name             AS customer_name
        
    FROM customers c          
    """)


def downgrade():
    op.execute("DROP VIEW IF EXISTS v_test_c;")
    op.execute("DROP VIEW IF EXISTS v_test_c2;")

