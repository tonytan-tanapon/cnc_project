from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "d039fc102986"
down_revision: Union[str, Sequence[str], None] = "ef9e47a7b7c0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- RBAC base tables ---
    op.create_table(
        "permissions",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("code", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
    )
    op.create_index(op.f("ix_permissions_code"), "permissions", ["code"], unique=True)

    op.create_table(
        "roles",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("code", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
    )
    op.create_index(op.f("ix_roles_code"), "roles", ["code"], unique=True)

    op.create_table(
        "role_permissions",
        sa.Column("role_id", sa.Integer(), nullable=False),
        sa.Column("permission_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"]),
        sa.ForeignKeyConstraint(["permission_id"], ["permissions.id"]),
        sa.PrimaryKeyConstraint("role_id", "permission_id"),
    )

    # --- users (ใส่ default ฝั่ง DB ให้จริง) ---
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("username", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.sql.expression.true(),      # <-- สำคัญ
        ),
        sa.Column(
            "is_superuser",
            sa.Boolean(),
            nullable=False,
            server_default=sa.sql.expression.false(),     # <-- สำคัญ
        ),
        sa.Column("employee_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),                 # ให้ default NOW()
        ),
        sa.Column("last_login_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"]),
        sa.UniqueConstraint("employee_id"),
    )
    op.create_index("ix_users_active", "users", ["is_active"], unique=False)
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_index(op.f("ix_users_username"), "users", ["username"], unique=True)

    # --- time_entries (ใส่ default และ partial unique index กัน open ซ้อน) ---
    op.create_table(
        "time_entries",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column(
            "clock_in_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),                 # default NOW()
        ),
        sa.Column("clock_in_method", sa.String(), nullable=True),
        sa.Column("clock_in_location", sa.String(), nullable=True),
        sa.Column("clock_out_at", sa.DateTime(), nullable=True),
        sa.Column("clock_out_method", sa.String(), nullable=True),
        sa.Column("clock_out_location", sa.String(), nullable=True),
        sa.Column(
            "status",
            sa.String(),
            nullable=False,
            server_default=sa.text("'open'"),             # default 'open'
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"]),
    )
    op.create_index(
        "ix_time_entries_emp_status",
        "time_entries",
        ["employee_id", "status"],
        unique=False,
    )
    op.create_index(op.f("ix_time_entries_employee_id"), "time_entries", ["employee_id"], unique=False)
    op.create_index("ix_time_entries_in", "time_entries", ["clock_in_at"], unique=False)
    op.create_index("ix_time_entries_out", "time_entries", ["clock_out_at"], unique=False)

    # partial unique index: per employee มีได้แค่ 1 แถว status='open'
    op.create_index(
        "uq_time_entries_one_open",
        "time_entries",
        ["employee_id"],
        unique=True,
        postgresql_where=sa.text("status = 'open'"),
    )

    op.create_table(
        "user_roles",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("role_id", sa.Integer(), nullable=False),
        sa.Column(
            "assigned_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"]),
        sa.PrimaryKeyConstraint("user_id", "role_id"),
    )

    # ของเดิมในไฟล์คุณที่แก้ production_lots / shop_travelers
    op.alter_column("production_lots", "part_revision_id", existing_type=sa.INTEGER(), nullable=True)
    op.drop_index(op.f("ix_production_lots_part_id"), table_name="production_lots")
    op.drop_index(op.f("ix_production_lots_part_revision_id"), table_name="production_lots")
    op.drop_column("production_lots", "part_no")
    op.drop_constraint(op.f("shop_travelers_lot_id_key"), "shop_travelers", type_="unique")


def downgrade() -> None:
    # กลับลำดับย้อนกลับ
    op.create_unique_constraint(op.f("shop_travelers_lot_id_key"), "shop_travelers", ["lot_id"], postgresql_nulls_not_distinct=False)
    op.add_column("production_lots", sa.Column("part_no", sa.VARCHAR(), nullable=True))
    op.create_index(op.f("ix_production_lots_part_revision_id"), "production_lots", ["part_revision_id"], unique=False)
    op.create_index(op.f("ix_production_lots_part_id"), "production_lots", ["part_id"], unique=False)
    op.alter_column("production_lots", "part_revision_id", existing_type=sa.INTEGER(), nullable=False)

    op.drop_table("user_roles")

    op.drop_index("uq_time_entries_one_open", table_name="time_entries")
    op.drop_index("ix_time_entries_out", table_name="time_entries")
    op.drop_index("ix_time_entries_in", table_name="time_entries")
    op.drop_index(op.f("ix_time_entries_employee_id"), table_name="time_entries")
    op.drop_index("ix_time_entries_emp_status", table_name="time_entries")
    op.drop_table("time_entries")

    op.drop_index(op.f("ix_users_username"), table_name="users")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_index("ix_users_active", table_name="users")
    op.drop_table("users")

    op.drop_table("role_permissions")
    op.drop_index(op.f("ix_roles_code"), table_name="roles")
    op.drop_table("roles")
    op.drop_index(op.f("ix_permissions_code"), table_name="permissions")
    op.drop_table("permissions")
