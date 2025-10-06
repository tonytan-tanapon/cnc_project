"""create machine_schedule

Revision ID: d7c12a3d5cf0
Revises: 3e309e6c067d
Create Date: 2025-10-05 19:39:49.889864

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd7c12a3d5cf0'
down_revision: Union[str, Sequence[str], None] = '3e309e6c067d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.create_table(
        "machine_schedule",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("machine_id", sa.Integer,
                  sa.ForeignKey("machines.id"),
                  nullable=False),
        sa.Column("traveler_step_id", sa.Integer,
                  sa.ForeignKey("shop_traveler_steps.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("planned_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("planned_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String, nullable=False, server_default="scheduled"),
    )
    # สร้าง unique + index ตามโมเดล
    op.create_unique_constraint(
        "uq_machine_step_once",
        "machine_schedule",
        ["machine_id", "traveler_step_id"],
    )
    op.create_index(
        "ix_machine_schedule_machine",
        "machine_schedule",
        ["machine_id", "planned_start"],
    )

def downgrade():
    op.drop_index("ix_machine_schedule_machine", table_name="machine_schedule")
    op.drop_constraint("uq_machine_step_once", "machine_schedule", type_="unique")
    op.drop_table("machine_schedule")