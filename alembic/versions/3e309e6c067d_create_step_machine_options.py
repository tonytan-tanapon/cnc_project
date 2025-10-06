"""create step_machine_options

Revision ID: 3e309e6c067d
Revises: 1992b26ff19b
Create Date: 2025-10-05 19:37:29.872389

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3e309e6c067d'
down_revision: Union[str, Sequence[str], None] = '1992b26ff19b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.create_table(
        "step_machine_options",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("traveler_step_id", sa.Integer,
                  sa.ForeignKey("shop_traveler_steps.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("machine_id", sa.Integer,
                  sa.ForeignKey("machines.id"),
                  nullable=False, index=True),
        sa.Column("priority", sa.Integer, nullable=True),
    )

    op.create_unique_constraint(
        "uq_step_machine_option",
        "step_machine_options",
        ["traveler_step_id", "machine_id"],
    )
    op.create_index(
        "ix_step_machine_option_step",
        "step_machine_options",
        ["traveler_step_id"],
    )
    op.create_index(
        "ix_step_machine_option_machine",
        "step_machine_options",
        ["machine_id"],
    )

def downgrade():
    op.drop_index("ix_step_machine_option_machine", table_name="step_machine_options")
    op.drop_index("ix_step_machine_option_step", table_name="step_machine_options")
    op.drop_constraint("uq_step_machine_option", "step_machine_options", type_="unique")
    op.drop_table("step_machine_options")