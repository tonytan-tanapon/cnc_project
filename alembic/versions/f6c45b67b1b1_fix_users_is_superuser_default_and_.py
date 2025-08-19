"""fix users.is_superuser default and backfill

Revision ID: f6c45b67b1b1
Revises: d039fc102986
Create Date: 2025-08-18 22:11:11.442237

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f6c45b67b1b1'
down_revision: Union[str, Sequence[str], None] = 'd039fc102986'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    # เติมค่าให้แถวเก่าที่เป็น NULL ก่อน เพื่อไม่ให้ชน NOT NULL
    op.execute("UPDATE users SET is_superuser = FALSE WHERE is_superuser IS NULL;")

    # ตั้งค่า default ฝั่ง DB + บังคับ NOT NULL
    op.alter_column(
        "users",
        "is_superuser",
        existing_type=sa.Boolean(),
        nullable=False,
        server_default=sa.sql.expression.false()
    )


def downgrade() -> None:
    """Downgrade schema."""
    pass
