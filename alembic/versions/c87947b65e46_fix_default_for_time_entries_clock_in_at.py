"""fix default for time_entries.clock_in_at

Revision ID: c87947b65e46
Revises: 68a65d2e8b93
Create Date: 2025-08-18 22:19:38.024547

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c87947b65e46'
down_revision: Union[str, Sequence[str], None] = '68a65d2e8b93'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade():
    # เติมค่าให้แถวเก่าที่ clock_in_at ยัง NULL
    op.execute("UPDATE time_entries SET clock_in_at = NOW() WHERE clock_in_at IS NULL;")

    # เพิ่ม default now() ให้ column
    op.alter_column(
        "time_entries",
        "clock_in_at",
        existing_type=sa.DateTime(),
        nullable=False,
        server_default=sa.func.now()
    )


def downgrade() -> None:
    """Downgrade schema."""
    pass
