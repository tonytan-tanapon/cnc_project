"""add package_no to customer_shipments (defensive / idempotent)

Revision ID: 23b883c5e05b
Revises: cdad821dd4b3
Create Date: 2025-10-09 08:12:43.541019
"""
from __future__ import annotations

from typing import Sequence, Union, Optional

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "23b883c5e05b"
down_revision: Union[str, Sequence[str], None] = "cdad821dd4b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# ---- helpers ---------------------------------------------------------------

def _insp():
    return sa.inspect(op.get_bind())

def _table_exists(name: str, schema: Optional[str] = None) -> bool:
    return _insp().has_table(name, schema=schema)

def _col_exists(table: str, col: str, schema: Optional[str] = None) -> bool:
    cols = [c["name"] for c in _insp().get_columns(table, schema=schema)]
    return col in cols

def _index_exists(table: str, index_name: str, schema: Optional[str] = None) -> bool:
    return any(ix["name"] == index_name for ix in _insp().get_indexes(table, schema=schema))

def _fk_exists(table: str, fk_name: str, schema: Optional[str] = None) -> bool:
    return any(fk["name"] == fk_name for fk in _insp().get_foreign_keys(table, schema=schema))

# explicit FK names so we can check / drop safely
FK_RAW_FAMILY = "fk_raw_materials_family_code"
FK_RAW_FORM   = "fk_raw_materials_form_code"
FK_RAW_GRADE  = "fk_raw_materials_grade_code"

def upgrade() -> None:
    """Upgrade schema (safe/idempotent)."""
    # --- supplier catalogs (create only if missing) -------------------------
    if not _table_exists("supplier_mat_category_catalog"):
        op.create_table(
            "supplier_mat_category_catalog",
            sa.Column("code", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("parent_code", sa.String(), nullable=True),
            sa.Column("kind", sa.String(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.ForeignKeyConstraint(["parent_code"], ["supplier_mat_category_catalog.code"]),
            sa.PrimaryKeyConstraint("code"),
        )

    if not _table_exists("supplier_service_catalog"):
        op.create_table(
            "supplier_service_catalog",
            sa.Column("code", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("category", sa.String(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.PrimaryKeyConstraint("code"),
        )

    if not _table_exists("supplier_material_categories"):
        op.create_table(
            "supplier_material_categories",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("supplier_id", sa.Integer(), nullable=False),
            sa.Column("category_code", sa.String(), nullable=False),
            sa.Column("min_order_qty", sa.Numeric(18, 3), nullable=True),
            sa.Column("uom", sa.String(), nullable=True),
            sa.Column("lead_time_days", sa.Integer(), nullable=True),
            sa.Column("price_note", sa.Text(), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(["category_code"], ["supplier_mat_category_catalog.code"]),
            sa.ForeignKeyConstraint(["supplier_id"], ["suppliers.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("supplier_id", "category_code", name="uq_supplier_matcat_once"),
        )
        if not _index_exists("supplier_material_categories", "ix_supplier_matcat_lookup"):
            op.create_index("ix_supplier_matcat_lookup", "supplier_material_categories", ["category_code", "supplier_id"])
        if not _index_exists("supplier_material_categories", "ix_supplier_material_categories_category_code"):
            op.create_index(sa.schema._get_index_name("ix_supplier_material_categories_category_code"), "supplier_material_categories", ["category_code"])
        if not _index_exists("supplier_material_categories", "ix_supplier_material_categories_supplier_id"):
            op.create_index(sa.schema._get_index_name("ix_supplier_material_categories_supplier_id"), "supplier_material_categories", ["supplier_id"])

    if not _table_exists("supplier_services"):
        op.create_table(
            "supplier_services",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("supplier_id", sa.Integer(), nullable=False),
            sa.Column("service_code", sa.String(), nullable=False),
            sa.ForeignKeyConstraint(["service_code"], ["supplier_service_catalog.code"], ondelete="RESTRICT"),
            sa.ForeignKeyConstraint(["supplier_id"], ["suppliers.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("supplier_id", "service_code", name="uq_supplier_service_once"),
        )
        if not _index_exists("supplier_services", "ix_supplier_services_lookup"):
            op.create_index("ix_supplier_services_lookup", "supplier_services", ["service_code", "supplier_id"])
        if not _index_exists("supplier_services", "ix_supplier_services_service_code"):
            op.create_index(sa.schema._get_index_name("ix_supplier_services_service_code"), "supplier_services", ["service_code"])
        if not _index_exists("supplier_services", "ix_supplier_services_supplier_id"):
            op.create_index(sa.schema._get_index_name("ix_supplier_services_supplier_id"), "supplier_services", ["supplier_id"])

    # --- customer_shipments.package_no --------------------------------------
    if not _col_exists("customer_shipments", "package_no"):
        op.add_column("customer_shipments", sa.Column("package_no", sa.String(), nullable=True))
    if not _index_exists("customer_shipments", "ix_customer_shipments_package_no"):
        op.create_index("ix_customer_shipments_package_no", "customer_shipments", ["package_no"])

    # --- production_lots.note ------------------------------------------------
    if not _col_exists("production_lots", "note"):
        op.add_column("production_lots", sa.Column("note", sa.String(), nullable=True))

    # --- raw_materials: indexes + FKs to supplier_mat_category_catalog -------
    if not _index_exists("raw_materials", "ix_raw_materials_family_code"):
        op.create_index("ix_raw_materials_family_code", "raw_materials", ["family_code"])
    if not _index_exists("raw_materials", "ix_raw_materials_form_code"):
        op.create_index("ix_raw_materials_form_code", "raw_materials", ["form_code"])
    if not _index_exists("raw_materials", "ix_raw_materials_grade_code"):
        op.create_index("ix_raw_materials_grade_code", "raw_materials", ["grade_code"])

    # Add FKs only if catalog table exists and FK missing
    if _table_exists("supplier_mat_category_catalog"):
        if not _fk_exists("raw_materials", FK_RAW_FAMILY) and _col_exists("raw_materials", "family_code"):
            op.create_foreign_key(FK_RAW_FAMILY, "raw_materials", "supplier_mat_category_catalog", ["family_code"], ["code"])
        if not _fk_exists("raw_materials", FK_RAW_FORM) and _col_exists("raw_materials", "form_code"):
            op.create_foreign_key(FK_RAW_FORM, "raw_materials", "supplier_mat_category_catalog", ["form_code"], ["code"])
        if not _fk_exists("raw_materials", FK_RAW_GRADE) and _col_exists("raw_materials", "grade_code"):
            op.create_foreign_key(FK_RAW_GRADE, "raw_materials", "supplier_mat_category_catalog", ["grade_code"], ["code"])

    # --- shop_traveler_steps.step_note --------------------------------------
    if not _col_exists("shop_traveler_steps", "step_note"):
        op.add_column("shop_traveler_steps", sa.Column("step_note", sa.Text(), nullable=True))

    # --- suppliers defaults + composite index --------------------------------
    with op.batch_alter_table("suppliers") as batch:
        batch.alter_column("is_material_supplier", existing_type=sa.BOOLEAN(), server_default=sa.text("false"), existing_nullable=False)
        batch.alter_column("is_subcontractor", existing_type=sa.BOOLEAN(), server_default=sa.text("false"), existing_nullable=False)
    if not _index_exists("suppliers", "ix_suppliers_roles"):
        op.create_index("ix_suppliers_roles", "suppliers", ["is_material_supplier", "is_subcontractor"])


def downgrade() -> None:
    """Best-effort downgrade (guarded)."""
    # suppliers composite index
    if _index_exists("suppliers", "ix_suppliers_roles"):
        op.drop_index("ix_suppliers_roles", table_name="suppliers")
    # revert defaults (optional) — safe to leave as-is in many shops

    # shop_traveler_steps.step_note
    if _col_exists("shop_traveler_steps", "step_note"):
        op.drop_column("shop_traveler_steps", "step_note")

    # raw_materials FKs (drop if present)
    if _fk_exists("raw_materials", FK_RAW_GRADE):
        op.drop_constraint(FK_RAW_GRADE, "raw_materials", type_="foreignkey")
    if _fk_exists("raw_materials", FK_RAW_FORM):
        op.drop_constraint(FK_RAW_FORM, "raw_materials", type_="foreignkey")
    if _fk_exists("raw_materials", FK_RAW_FAMILY):
        op.drop_constraint(FK_RAW_FAMILY, "raw_materials", type_="foreignkey")

    # raw_materials indexes
    if _index_exists("raw_materials", "ix_raw_materials_grade_code"):
        op.drop_index("ix_raw_materials_grade_code", table_name="raw_materials")
    if _index_exists("raw_materials", "ix_raw_materials_form_code"):
        op.drop_index("ix_raw_materials_form_code", table_name="raw_materials")
    if _index_exists("raw_materials", "ix_raw_materials_family_code"):
        op.drop_index("ix_raw_materials_family_code", table_name="raw_materials")

    # production_lots.note
    if _col_exists("production_lots", "note"):
        op.drop_column("production_lots", "note")

    # customer_shipments.package_no (+ index)
    if _index_exists("customer_shipments", "ix_customer_shipments_package_no"):
        op.drop_index("ix_customer_shipments_package_no", table_name="customer_shipments")
    if _col_exists("customer_shipments", "package_no"):
        op.drop_column("customer_shipments", "package_no")

    # supplier_* tables: only drop if they exist (and you really want to)
    if _table_exists("supplier_services"):
        op.drop_table("supplier_services")
    if _table_exists("supplier_material_categories"):
        op.drop_table("supplier_material_categories")
    if _table_exists("supplier_service_catalog"):
        op.drop_table("supplier_service_catalog")
    if _table_exists("supplier_mat_category_catalog"):
        op.drop_table("supplier_mat_category_catalog")
