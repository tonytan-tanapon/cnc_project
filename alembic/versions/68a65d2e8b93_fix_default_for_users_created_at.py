"""fix default for users.created_at

Revision ID: 68a65d2e8b93
Revises: 4cb8be2782de
Create Date: 2025-08-18 22:13:38.934745

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '68a65d2e8b93'
down_revision: Union[str, Sequence[str], None] = '4cb8be2782de'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    # อัปเดตค่าเก่า ๆ ให้มี timestamp (กันไม่ให้ NULL)
    op.execute("UPDATE users SET created_at = NOW() WHERE created_at IS NULL;")

    # เพิ่ม server_default ให้ DB
    op.alter_column(
        "users",
        "created_at",
        existing_type=sa.DateTime(),
        nullable=False,
        server_default=sa.func.now()
    )


def downgrade():
    op.alter_column(
        "users",
        "created_at",
        existing_type=sa.DateTime(),
        nullable=False,
        server_default=None
    )
