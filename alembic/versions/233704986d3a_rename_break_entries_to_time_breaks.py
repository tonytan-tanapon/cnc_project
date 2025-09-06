"""rename break_entries to time_breaks

Revision ID: 233704986d3a
Revises: 2ec17fcab11b
Create Date: 2025-09-05 22:37:04.772141

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '233704986d3a'
down_revision: Union[str, Sequence[str], None] = '2ec17fcab11b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.rename_table("break_entries", "time_breaks")
    op.execute("ALTER INDEX ix_break_entries_parent RENAME TO ix_time_breaks_parent")
    op.execute("ALTER INDEX ix_break_entries_start RENAME TO ix_time_breaks_start")
    op.execute("ALTER INDEX ix_break_entries_end RENAME TO ix_time_breaks_end")

def downgrade():
    op.rename_table("time_breaks", "break_entries")
    op.execute("ALTER INDEX ix_time_breaks_parent RENAME TO ix_break_entries_parent")
    op.execute("ALTER INDEX ix_time_breaks_start RENAME TO ix_break_entries_start")
    op.execute("ALTER INDEX ix_time_breaks_end RENAME TO ix_break_entries_end")
