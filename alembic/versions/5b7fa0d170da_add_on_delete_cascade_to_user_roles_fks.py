# alembic revision: 5b7fa0d170da  (Add ON DELETE CASCADE to user_roles FKs)
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect  # ✅ ใช้อันนี้แทน from_engine

# ---- แก้ให้ตรงกับโปรเจ็กต์ของคุณ ----
revision = "5b7fa0d170da"
down_revision = "24dbdb41ca89"   # <- ให้ตรงกับไฟล์ก่อนหน้าในโปรเจ็กต์คุณ
branch_labels = None
depends_on = None


def _find_fk_name(bind, table_name: str, constrained_cols: list[str], referred_table: str):
    """
    คืนชื่อ FK ที่ match (table, columns, referred_table)
    """
    insp = inspect(bind)  # ✅ แทน sa.from_engine(bind)
    want = set(constrained_cols or [])
    for fk in insp.get_foreign_keys(table_name):
        cols = set(fk.get("constrained_columns") or [])
        if fk.get("referred_table") == referred_table and cols == want:
            return fk.get("name")
    return None


def upgrade():
    bind = op.get_bind()

    user_fk = _find_fk_name(bind, "user_roles", ["user_id"], "users")
    role_fk = _find_fk_name(bind, "user_roles", ["role_id"], "roles")

    # ใช้ batch_alter_table เพื่อรองรับ backend ที่ ALTER CONSTRAINT ไม่ตรง ๆ เช่น SQLite
    with op.batch_alter_table("user_roles") as batch:
        if user_fk:
            batch.drop_constraint(user_fk, type_="foreignkey")
        if role_fk:
            batch.drop_constraint(role_fk, type_="foreignkey")

        batch.create_foreign_key(
            "fk_user_roles_user_id_users",
            referent_table="users",
            local_cols=["user_id"],
            remote_cols=["id"],
            ondelete="CASCADE",
        )
        batch.create_foreign_key(
            "fk_user_roles_role_id_roles",
            referent_table="roles",
            local_cols=["role_id"],
            remote_cols=["id"],
            ondelete="CASCADE",
        )


def downgrade():
    with op.batch_alter_table("user_roles") as batch:
        batch.drop_constraint("fk_user_roles_user_id_users", type_="foreignkey")
        batch.drop_constraint("fk_user_roles_role_id_roles", type_="foreignkey")

        batch.create_foreign_key(
            "fk_user_roles_user_id_users",
            referent_table="users",
            local_cols=["user_id"],
            remote_cols=["id"],
        )
        batch.create_foreign_key(
            "fk_user_roles_role_id_roles",
            referent_table="roles",
            local_cols=["role_id"],
            remote_cols=["id"],
        )
