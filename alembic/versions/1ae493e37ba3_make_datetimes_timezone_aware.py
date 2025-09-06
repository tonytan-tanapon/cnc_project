"""make datetimes timezone-aware

Revision ID: 1ae493e37ba3
Revises: ecdecc81ef8a
Create Date: 2025-09-05 23:18:34.498429

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1ae493e37ba3'
down_revision: Union[str, Sequence[str], None] = 'ecdecc81ef8a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    # Helper: alter to timestamptz assuming existing naive values are UTC
    def to_timestamptz(table, column):
        op.execute(
            sa.text(f"""
                ALTER TABLE {table}
                ALTER COLUMN {column} TYPE timestamptz
                USING {column} AT TIME ZONE 'UTC'
            """)
        )

    # ProductionLot
    to_timestamptz("production_lots", "started_at")
    to_timestamptz("production_lots", "finished_at")

    # ShopTraveler
    to_timestamptz("shop_travelers", "created_at")
    op.execute("ALTER TABLE shop_travelers ALTER COLUMN created_at SET DEFAULT now()")

    # ShopTravelerStep
    to_timestamptz("shop_traveler_steps", "started_at")
    to_timestamptz("shop_traveler_steps", "finished_at")

    # SubconOrder
    to_timestamptz("subcon_orders", "created_at")
    op.execute("ALTER TABLE subcon_orders ALTER COLUMN created_at SET DEFAULT now()")

    # SubconShipment
    to_timestamptz("subcon_shipments", "shipped_at")
    op.execute("ALTER TABLE subcon_shipments ALTER COLUMN shipped_at SET DEFAULT now()")

    # SubconReceipt
    to_timestamptz("subcon_receipts", "received_at")
    op.execute("ALTER TABLE subcon_receipts ALTER COLUMN received_at SET DEFAULT now()")

    # InspectionRecord
    to_timestamptz("inspection_records", "started_at")
    to_timestamptz("inspection_records", "finished_at")
    op.execute("ALTER TABLE inspection_records ALTER COLUMN started_at SET DEFAULT now()")

    # TimeLeave
    to_timestamptz("time_leaves", "start_at")
    to_timestamptz("time_leaves", "end_at")

    # MachineSchedule
    to_timestamptz("machine_schedule", "planned_start")
    to_timestamptz("machine_schedule", "planned_end")

    # PayPeriod
    to_timestamptz("pay_periods", "start_at")
    to_timestamptz("pay_periods", "end_at")
    to_timestamptz("pay_periods", "locked_at")
    to_timestamptz("pay_periods", "paid_at")

    # "users"
    to_timestamptz("users", "created_at")
    to_timestamptz("users", "last_login_at")
    op.execute("ALTER TABLE users ALTER COLUMN created_at SET DEFAULT now()")

    # CustomerReturn
    to_timestamptz("customer_returns", "returned_at")
    op.execute("ALTER TABLE customer_returns ALTER COLUMN returned_at SET DEFAULT now()")


def downgrade():
    # ถ้าต้องย้อนกลับ (ไม่ค่อยแนะนำ) แปลงกลับเป็น timestamp without time zone
    def to_timestamp(table, column):
        op.execute(
            sa.text(f"""
                ALTER TABLE {table}
                ALTER COLUMN {column} TYPE timestamp
                USING (timezone('UTC', {column}))
            """)
        )

    # ใส่ตามลำดับกับ upgrade (ละไว้เพื่อย่อ)
    pass