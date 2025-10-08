"""add supplier flags

Revision ID: 6a4ab10d5581
Revises: a8af33bc882b
Create Date: 2025-10-07 19:34:32.474914

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6a4ab10d5581'
down_revision: Union[str, Sequence[str], None] = 'a8af33bc882b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade():
    with op.batch_alter_table("suppliers") as batch:
        batch.add_column(sa.Column("is_material_supplier", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch.add_column(sa.Column("is_subcontractor", sa.Boolean(), nullable=False, server_default=sa.false()))
    # เอา server_default ออก เพื่อไม่ให้ติด default ที่ DB ถ้าไม่ต้องการ
    with op.batch_alter_table("suppliers") as batch:
        batch.alter_column("is_material_supplier", server_default=None)
        batch.alter_column("is_subcontractor", server_default=None)

def downgrade():
    with op.batch_alter_table("suppliers") as batch:
        batch.drop_column("is_subcontractor")
        batch.drop_column("is_material_supplier")