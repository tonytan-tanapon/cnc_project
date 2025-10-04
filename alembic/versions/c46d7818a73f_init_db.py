"""init db

Revision ID: c46d7818a73f
Revises: 
Create Date: 2025-10-03 12:46:53.630807

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text


# revision identifiers, used by Alembic.
revision: str = 'c46d7818a73f'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None




def upgrade() -> None:
    # =========================
    # Master / Reference Tables
    # =========================
    op.create_table(
        "suppliers",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("code", sa.String(), nullable=False, unique=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("contact", sa.String()),
        sa.Column("email", sa.String()),
        sa.Column("phone", sa.String()),
        sa.Column("address", sa.String()),
        sa.Column("payment_terms", sa.String()),
    )
    op.create_index("ix_suppliers_code", "suppliers", ["code"], unique=True)

    op.create_table(
        "customers",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("code", sa.String(), nullable=False, unique=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("contact", sa.String()),
        sa.Column("email", sa.String()),
        sa.Column("phone", sa.String()),
        sa.Column("address", sa.String()),
    )
    op.create_index("ix_customers_code", "customers", ["code"], unique=True)

    op.create_table(
        "employees",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("emp_code", sa.String(), nullable=False, unique=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("position", sa.String()),
        sa.Column("department", sa.String()),
        sa.Column("email", sa.String()),
        sa.Column("phone", sa.String()),
        sa.Column("status", sa.String(), nullable=False, server_default=text("'active'")),
    )
    op.create_index("ix_employees_emp_code", "employees", ["emp_code"], unique=True)

    op.create_table(
        "raw_materials",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("code", sa.String(), nullable=False, unique=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("spec", sa.String()),
        sa.Column("uom", sa.String(), nullable=False, server_default=text("'kg'")),
        sa.Column("remark", sa.Text()),
    )
    op.create_index("ix_raw_materials_code", "raw_materials", ["code"], unique=True)

    op.create_table(
        "parts",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("part_no", sa.String(), nullable=False, unique=True),
        sa.Column("name", sa.String()),
        sa.Column("description", sa.Text()),
        sa.Column("default_uom", sa.String(), nullable=False, server_default=text("'ea'")),
        sa.Column("status", sa.String(), nullable=False, server_default=text("'active'")),
    )
    op.create_index("ix_parts_part_no", "parts", ["part_no"], unique=True)

    op.create_table(
        "machines",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("code", sa.String(), nullable=False, unique=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("type", sa.String()),
        sa.Column("controller", sa.String()),
        sa.Column("axis_count", sa.Integer()),
        sa.Column("spindle_power_kw", sa.Numeric(10, 3)),
        sa.Column("max_travel_x", sa.Numeric(10, 3)),
        sa.Column("max_travel_y", sa.Numeric(10, 3)),
        sa.Column("max_travel_z", sa.Numeric(10, 3)),
        sa.Column("location", sa.String()),
        sa.Column("status", sa.String(), nullable=False, server_default=text("'available'")),
        sa.Column("notes", sa.Text()),
    )
    op.create_index("ix_machines_code", "machines", ["code"], unique=True)
    op.create_index("ix_machines_status", "machines", ["status"])
    op.create_index("ix_machines_type_status", "machines", ["type", "status"])

    # Measurement devices FIRST to avoid FK errors later
    op.create_table(
        "measurement_devices",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("code", sa.String(), nullable=False, unique=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("type", sa.String()),
        sa.Column("brand", sa.String()),
        sa.Column("model", sa.String()),
        sa.Column("serial_no", sa.String()),
        sa.Column("location", sa.String()),
        sa.Column("status", sa.String(), nullable=False, server_default=text("'available'")),
        sa.Column("calibration_due", sa.Date()),
        sa.Column("notes", sa.Text()),
    )
    op.create_index("ix_measurement_devices_code", "measurement_devices", ["code"], unique=True)
    op.create_index("ix_measurement_devices_status", "measurement_devices", ["status"])
    op.create_index("ix_measurement_devices_type", "measurement_devices", ["type"])
    op.create_index("ix_measurement_devices_cal_due", "measurement_devices", ["calibration_due"])

    op.create_table(
        "mfg_processes",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("code", sa.String(), nullable=False, unique=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("category", sa.String()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=text("true")),
    )
    op.create_index("ix_mfg_processes_code", "mfg_processes", ["code"], unique=True)

    op.create_table(
        "chemical_finishes",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("code", sa.String(), nullable=False, unique=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=text("true")),
    )
    op.create_index("ix_chemical_finishes_code", "chemical_finishes", ["code"], unique=True)

    # ==============
    # Auth / RBAC
    # ==============
    op.create_table(
        "roles",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("code", sa.String(), nullable=False, unique=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text()),
    )
    op.create_index("ix_roles_code", "roles", ["code"], unique=True)

    op.create_table(
        "permissions",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("code", sa.String(), nullable=False, unique=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text()),
    )
    op.create_index("ix_permissions_code", "permissions", ["code"], unique=True)

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("username", sa.String(), nullable=False, unique=True),
        sa.Column("email", sa.String(), unique=True),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=text("true")),
        sa.Column("is_superuser", sa.Boolean(), nullable=False, server_default=text("false")),
        sa.Column("employee_id", sa.Integer(), sa.ForeignKey("employees.id", ondelete="SET NULL"), unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=text("now()")),
        sa.Column("last_login_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_users_username", "users", ["username"], unique=True)
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_employee_id", "users", ["employee_id"], unique=True)
    op.create_index("ix_users_active", "users", ["is_active"])

    op.create_table(
        "role_permissions",
        sa.Column("role_id", sa.Integer(), sa.ForeignKey("roles.id"), primary_key=True),
        sa.Column("permission_id", sa.Integer(), sa.ForeignKey("permissions.id"), primary_key=True),
    )

    op.create_table(
        "user_roles",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("role_id", sa.Integer(), sa.ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=False, server_default=text("now()")),
    )

    # ===========================
    # Sales / Orders / Shipments
    # ===========================
    op.create_table(
        "purchase_orders",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("po_number", sa.String(), nullable=False, unique=True),
        sa.Column("description", sa.String()),
        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id"), nullable=False),
    )
    op.create_index("ix_purchase_orders_po_number", "purchase_orders", ["po_number"], unique=True)
    op.create_index("ix_purchase_orders_customer_id", "purchase_orders", ["customer_id"])

    # ==============
    # Part Revision
    # ==============
    # Create without FK to inspection_records (cycle) – will be added later.
    op.create_table(
        "part_revisions",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("part_id", sa.Integer(), sa.ForeignKey("parts.id"), nullable=False),
        sa.Column("rev", sa.String(), nullable=False),
        sa.Column("drawing_file", sa.String()),
        sa.Column("spec", sa.String()),
        sa.Column("is_current", sa.Boolean(), nullable=False, server_default=text("false")),
        sa.Column("fair_record_id", sa.Integer(), nullable=True),  # FK added later
        sa.Column("fair_no_cache", sa.String()),
        sa.Column("fair_date_cache", sa.Date()),
        sa.UniqueConstraint("part_id", "rev", name="uq_part_rev"),
        sa.UniqueConstraint("part_id", "id", name="uq_part_id_id"),
    )
    op.create_index("ix_part_revisions_part_id", "part_revisions", ["part_id"])
    op.create_index("ix_part_revisions_part_rev", "part_revisions", ["part_id", "rev"])
    op.create_index("ix_part_revisions_fair_record_id", "part_revisions", ["fair_record_id"], unique=True)

    # ==========
    # PO Lines
    # ==========
    op.create_table(
        "po_lines",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("po_id", sa.Integer(), sa.ForeignKey("purchase_orders.id"), nullable=False),
        sa.Column("part_id", sa.Integer(), sa.ForeignKey("parts.id"), nullable=False),
        sa.Column("revision_id", sa.Integer(), nullable=True),
        sa.Column("qty_ordered", sa.Numeric(18, 3), nullable=False),
        sa.Column("unit_price", sa.Numeric(18, 2)),
        sa.Column("due_date", sa.Date()),
        sa.Column("notes", sa.Text()),
        sa.ForeignKeyConstraint(
            ["part_id", "revision_id"],
            ["part_revisions.part_id", "part_revisions.id"],
            name="fk_poline_part_rev_pair",
        ),
    )
    op.create_index("ix_po_lines_po", "po_lines", ["po_id"])
    op.create_index("ix_po_lines_part_rev", "po_lines", ["part_id", "revision_id"])
    op.create_index("ix_po_lines_part_id", "po_lines", ["part_id"])
    op.create_index("ix_po_lines_revision_id", "po_lines", ["revision_id"])

    # ==========================
    # Production / Travelers
    # ==========================
    # production_lots: add fair_record_id FK later (cycle)
    op.create_table(
        "production_lots",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("lot_no", sa.String(), nullable=False, unique=True),
        sa.Column("part_id", sa.Integer(), sa.ForeignKey("parts.id"), nullable=False),
        sa.Column("part_revision_id", sa.Integer(), sa.ForeignKey("part_revisions.id")),
        sa.Column("po_id", sa.Integer(), sa.ForeignKey("purchase_orders.id")),
        sa.Column("po_line_id", sa.Integer(), sa.ForeignKey("po_lines.id")),
        sa.Column("planned_qty", sa.Integer(), nullable=False, server_default=text("0")),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.Column("lot_due_date", sa.Date()),
        sa.Column("status", sa.String(), nullable=False, server_default=text("'in_process'")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=text("now()")),
        sa.Column("fair_required", sa.Boolean(), nullable=False, server_default=text("false")),
        sa.Column("fair_record_id", sa.Integer(), nullable=True),  # FK added later
    )
    op.create_index("ix_lots_no", "production_lots", ["lot_no"])
    op.create_index("ix_lots_status", "production_lots", ["status"])
    op.create_index("ix_lots_part", "production_lots", ["part_id", "part_revision_id"])
    op.create_index("ix_production_lots_lot_due_date", "production_lots", ["lot_due_date"])
    op.create_index("ix_production_lots_po_id", "production_lots", ["po_id"])
    op.create_index("ix_production_lots_po_line_id", "production_lots", ["po_line_id"])
    op.create_index("ix_production_lots_part_id", "production_lots", ["part_id"])
    op.create_index("ix_production_lots_part_revision_id", "production_lots", ["part_revision_id"])
    op.create_index("ix_production_lots_fair_record_id", "production_lots", ["fair_record_id"])

    op.create_table(
        "shop_travelers",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("traveler_no", sa.String(), nullable=False, unique=True),
        sa.Column("lot_id", sa.Integer(), sa.ForeignKey("production_lots.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=text("now()")),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("employees.id")),
        sa.Column("status", sa.String(), nullable=False, server_default=text("'open'")),
        sa.Column("notes", sa.Text()),
        sa.Column("production_due_date", sa.Date()),
    )
    op.create_index("ix_shop_travelers_traveler_no", "shop_travelers", ["traveler_no"], unique=True)
    op.create_index("ix_shop_travelers_status", "shop_travelers", ["status"])
    op.create_index("ix_shop_travelers_production_due_date", "shop_travelers", ["production_due_date"])

    op.create_table(
        "shop_traveler_steps",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("traveler_id", sa.Integer(), sa.ForeignKey("shop_travelers.id"), nullable=False),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("step_code", sa.String()),
        sa.Column("step_name", sa.String(), nullable=False),
        sa.Column("station", sa.String()),
        sa.Column("status", sa.String(), nullable=False, server_default=text("'pending'")),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.Column("operator_id", sa.Integer(), sa.ForeignKey("employees.id")),
        sa.Column("machine_id", sa.Integer(), sa.ForeignKey("machines.id")),
        sa.Column("qa_required", sa.Boolean(), nullable=False, server_default=text("false")),
        sa.Column("qa_result", sa.String()),
        sa.Column("qa_notes", sa.Text()),
        sa.Column("qty_receive", sa.Numeric(18, 3), nullable=False, server_default=text("0")),
        sa.Column("qty_accept", sa.Numeric(18, 3), nullable=False, server_default=text("0")),
        sa.Column("qty_reject", sa.Numeric(18, 3), nullable=False, server_default=text("0")),
        sa.UniqueConstraint("traveler_id", "seq", name="uq_traveler_seq"),
    )
    op.create_index("ix_shop_traveler_steps_traveler_id", "shop_traveler_steps", ["traveler_id"])
    op.create_index("ix_traveler_steps_status", "shop_traveler_steps", ["status"])
    op.create_index("ix_traveler_steps_operator", "shop_traveler_steps", ["operator_id"])
    op.create_index("ix_traveler_steps_machine", "shop_traveler_steps", ["machine_id"])

    # =====================
    # Inspection & QA
    # =====================
    op.create_table(
        "device_calibrations",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("device_id", sa.Integer(), sa.ForeignKey("measurement_devices.id"), nullable=False),
        sa.Column("calibrated_at", sa.Date(), nullable=False),
        sa.Column("due_at", sa.Date()),
        sa.Column("performed_by", sa.String()),
        sa.Column("result", sa.String()),
        sa.Column("certificate_file", sa.String()),
    )
    op.create_index("ix_device_calibrations_device", "device_calibrations", ["device_id", "calibrated_at"])
    op.create_index("ix_device_calibrations_device_id", "device_calibrations", ["device_id"])

    # Create inspection_records WITHOUT its backref FK to part_revisions (we already have part_revisions)
    op.create_table(
        "inspection_records",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("traveler_step_id", sa.Integer(), sa.ForeignKey("shop_traveler_steps.id"), nullable=False),
        sa.Column("is_fair", sa.Boolean(), nullable=False, server_default=text("false")),
        sa.Column("fair_no", sa.String()),
        sa.Column("fair_doc_file", sa.String()),
        sa.Column("fair_date", sa.Date()),
        sa.Column("part_revision_id", sa.Integer(), sa.ForeignKey("part_revisions.id")),
        sa.Column("inspector_id", sa.Integer(), sa.ForeignKey("employees.id")),
        sa.Column("device_id", sa.Integer(), sa.ForeignKey("measurement_devices.id")),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=text("now()")),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.Column("overall_result", sa.String()),
        sa.Column("notes", sa.Text()),
    )
    op.create_index("ix_inspection_records_traveler_step_id", "inspection_records", ["traveler_step_id"])
    op.create_index("ix_inspection_records_device_id", "inspection_records", ["device_id"])
    op.create_index("ix_inspection_records_inspector_id", "inspection_records", ["inspector_id"])
    op.create_index("ix_inspection_records_part_revision_id", "inspection_records", ["part_revision_id"])
    op.create_index("ix_inspection_records_result", "inspection_records", ["overall_result"])
    op.create_index("ix_inspection_records_fair_rev", "inspection_records", ["part_revision_id", "is_fair"])

    op.create_table(
        "inspection_items",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("record_id", sa.Integer(), sa.ForeignKey("inspection_records.id"), nullable=False),
        sa.Column("characteristic", sa.String(), nullable=False),
        sa.Column("nominal_value", sa.Numeric(18, 4)),
        sa.Column("tol_lower", sa.Numeric(18, 4)),
        sa.Column("tol_upper", sa.Numeric(18, 4)),
        sa.Column("measured_value", sa.Numeric(18, 4)),
        sa.Column("unit", sa.String()),
        sa.Column("result", sa.String()),
        sa.Column("device_id", sa.Integer(), sa.ForeignKey("measurement_devices.id")),
        sa.Column("attachment", sa.String()),
    )
    op.create_index("ix_inspection_items_record", "inspection_items", ["record_id"])
    op.create_index("ix_inspection_items_result", "inspection_items", ["result"])
    op.create_index("ix_inspection_items_device_id", "inspection_items", ["device_id"])

    # Now add back-referencing FKs that close the cycles
    op.create_foreign_key(
        "fk_part_revisions_fair_record_id",
        source_table="part_revisions",
        referent_table="inspection_records",
        local_cols=["fair_record_id"],
        remote_cols=["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_production_lots_fair_record_id",
        source_table="production_lots",
        referent_table="inspection_records",
        local_cols=["fair_record_id"],
        remote_cols=["id"],
        ondelete="SET NULL",
    )

    # ======================
    # Materials / Purchasing
    # ======================
    op.create_table(
        "material_pos",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("po_number", sa.String(), nullable=False, unique=True),
        sa.Column("supplier_id", sa.Integer(), sa.ForeignKey("suppliers.id"), nullable=False),
        sa.Column("order_date", sa.Date(), nullable=False, server_default=text("CURRENT_DATE")),
        sa.Column("status", sa.String(), nullable=False, server_default=text("'open'")),
        sa.Column("notes", sa.Text()),
    )
    op.create_index("ix_material_pos_po_number", "material_pos", ["po_number"], unique=True)
    op.create_index("ix_material_pos_supplier_id", "material_pos", ["supplier_id"])

    op.create_table(
        "material_po_lines",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("po_id", sa.Integer(), sa.ForeignKey("material_pos.id"), nullable=False),
        sa.Column("material_id", sa.Integer(), sa.ForeignKey("raw_materials.id"), nullable=False),
        sa.Column("qty_ordered", sa.Numeric(18, 3), nullable=False),
        sa.Column("unit_price", sa.Numeric(18, 2)),
        sa.Column("due_date", sa.Date()),
    )
    op.create_index("ix_material_po_lines_po_id", "material_po_lines", ["po_id"])
    op.create_index("ix_material_po_lines_material_id", "material_po_lines", ["material_id"])

    op.create_table(
        "raw_batches",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("material_id", sa.Integer(), sa.ForeignKey("raw_materials.id"), nullable=False),
        sa.Column("supplier_id", sa.Integer(), sa.ForeignKey("suppliers.id")),
        sa.Column("material_po_line_id", sa.Integer(), sa.ForeignKey("material_po_lines.id")),
        sa.Column("po_id", sa.Integer(), sa.ForeignKey("material_pos.id")),
        sa.Column("batch_no", sa.String(), nullable=False),
        sa.Column("supplier_batch_no", sa.String()),
        sa.Column("mill_name", sa.String()),
        sa.Column("mill_heat_no", sa.String()),
        sa.Column("received_at", sa.Date()),
        sa.Column("qty_received", sa.Numeric(18, 3), nullable=False, server_default=text("0")),
        sa.Column("cert_file", sa.String()),
        sa.Column("location", sa.String()),
        sa.UniqueConstraint("material_id", "batch_no", "supplier_id", name="uq_batch_material_supplier"),
    )
    op.create_index("ix_raw_batches_batch_no", "raw_batches", ["batch_no"])
    op.create_index("ix_raw_batches_mat_recv", "raw_batches", ["material_id", "received_at"])
    op.create_index("ix_raw_batches_supplier", "raw_batches", ["supplier_id"])
    op.create_index("ix_raw_batches_po", "raw_batches", ["po_id"])
    op.create_index("ix_raw_batches_material_id", "raw_batches", ["material_id"])
    op.create_index("ix_raw_batches_material_po_line_id", "raw_batches", ["material_po_line_id"])
    op.create_index("ix_raw_batches_supplier_id", "raw_batches", ["supplier_id"])
    op.create_index("ix_raw_batches_po_id", "raw_batches", ["po_id"])

    op.create_table(
        "lot_material_use",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("lot_id", sa.Integer(), sa.ForeignKey("production_lots.id"), nullable=False),
        sa.Column("batch_id", sa.Integer(), sa.ForeignKey("raw_batches.id"), nullable=False),
        sa.Column("raw_material_id", sa.Integer(), sa.ForeignKey("raw_materials.id"), nullable=False),
        sa.Column("qty", sa.Numeric(18, 3), nullable=False),
        sa.Column("uom", sa.String()),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=False, server_default=text("now()")),
        sa.Column("used_by_id", sa.Integer(), sa.ForeignKey("employees.id")),
        sa.Column("note", sa.Text()),
    )
    op.create_index("ix_lmu_lot", "lot_material_use", ["lot_id"])
    op.create_index("ix_lmu_batch", "lot_material_use", ["batch_id"])
    op.create_index("ix_lmu_rm", "lot_material_use", ["raw_material_id"])
    op.create_index("ix_lot_material_use_lot_id", "lot_material_use", ["lot_id"])
    op.create_index("ix_lot_material_use_batch_id", "lot_material_use", ["batch_id"])
    op.create_index("ix_lot_material_use_raw_material_id", "lot_material_use", ["raw_material_id"])

    # =========================
    # Subcontracting
    # =========================
    op.create_table(
        "subcon_orders",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("supplier_id", sa.Integer(), sa.ForeignKey("suppliers.id"), nullable=False),
        sa.Column("ref_no", sa.String()),
        sa.Column("status", sa.String(), nullable=False, server_default=text("'open'")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=text("now()")),
        sa.Column("due_date", sa.Date()),
        sa.Column("notes", sa.Text()),
    )
    op.create_index("ix_subcon_orders_supplier_id", "subcon_orders", ["supplier_id"])
    op.create_index("ix_subcon_orders_supplier_status", "subcon_orders", ["supplier_id", "status"])

    op.create_table(
        "subcon_order_lines",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("subcon_orders.id"), nullable=False),
        sa.Column("traveler_step_id", sa.Integer(), sa.ForeignKey("shop_traveler_steps.id"), nullable=False),
        sa.Column("qty_planned", sa.Numeric(18, 3), nullable=False, server_default=text("0")),
        sa.Column("unit_cost", sa.Numeric(18, 2)),
        sa.UniqueConstraint("order_id", "traveler_step_id", name="uq_order_step"),
    )
    op.create_index("ix_subcon_order_lines_order_id", "subcon_order_lines", ["order_id"])
    op.create_index("ix_subcon_order_lines_traveler_step_id", "subcon_order_lines", ["traveler_step_id"])
    op.create_index("ix_subcon_order_lines_step", "subcon_order_lines", ["traveler_step_id"])

    op.create_table(
        "subcon_shipments",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("subcon_orders.id"), nullable=False),
        sa.Column("shipped_at", sa.DateTime(timezone=True), nullable=False, server_default=text("now()")),
        sa.Column("shipped_by", sa.String()),
        sa.Column("package_no", sa.String()),
        sa.Column("carrier", sa.String()),
        sa.Column("tracking_no", sa.String()),
        sa.Column("status", sa.String(), nullable=False, server_default=text("'shipped'")),
    )
    op.create_index("ix_subcon_shipments_order_id", "subcon_shipments", ["order_id"])

    op.create_table(
        "subcon_shipment_items",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("shipment_id", sa.Integer(), sa.ForeignKey("subcon_shipments.id"), nullable=False),
        sa.Column("traveler_step_id", sa.Integer(), sa.ForeignKey("shop_traveler_steps.id"), nullable=False),
        sa.Column("qty", sa.Numeric(18, 3), nullable=False, server_default=text("0")),
    )
    op.create_index("ix_subcon_shipment_items_shipment_id", "subcon_shipment_items", ["shipment_id"])
    op.create_index("ix_subcon_shipment_items_traveler_step_id", "subcon_shipment_items", ["traveler_step_id"])
    op.create_index("ix_subcon_shipment_items_step", "subcon_shipment_items", ["traveler_step_id"])

    op.create_table(
        "subcon_receipts",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("subcon_orders.id"), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False, server_default=text("now()")),
        sa.Column("received_by", sa.String()),
        sa.Column("doc_no", sa.String()),
        sa.Column("status", sa.String(), nullable=False, server_default=text("'received'")),
    )
    op.create_index("ix_subcon_receipts_order_id", "subcon_receipts", ["order_id"])

    op.create_table(
        "subcon_receipt_items",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("receipt_id", sa.Integer(), sa.ForeignKey("subcon_receipts.id"), nullable=False),
        sa.Column("traveler_step_id", sa.Integer(), sa.ForeignKey("shop_traveler_steps.id"), nullable=False),
        sa.Column("qty_received", sa.Numeric(18, 3), nullable=False, server_default=text("0")),
        sa.Column("qty_rejected", sa.Numeric(18, 3), nullable=False, server_default=text("0")),
        sa.Column("scrap_qty", sa.Numeric(18, 3), nullable=False, server_default=text("0")),
        sa.Column("qa_result", sa.String()),
        sa.Column("qa_notes", sa.Text()),
    )
    op.create_index("ix_subcon_receipt_items_receipt_id", "subcon_receipt_items", ["receipt_id"])
    op.create_index("ix_subcon_receipt_items_traveler_step_id", "subcon_receipt_items", ["traveler_step_id"])
    op.create_index("ix_subcon_receipt_items_step", "subcon_receipt_items", ["traveler_step_id"])

    # ===========================
    # Selections / Part metadata
    # ===========================
    op.create_table(
        "part_process_selections",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("part_id", sa.Integer(), sa.ForeignKey("parts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("process_id", sa.Integer(), sa.ForeignKey("mfg_processes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=text("now()")),
        sa.UniqueConstraint("part_id", "process_id", name="uq_part_process"),
    )
    op.create_index("ix_part_process_selections_part_id", "part_process_selections", ["part_id"])
    op.create_index("ix_part_process_selections_process_id", "part_process_selections", ["process_id"])

    op.create_table(
        "part_finish_selections",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("part_id", sa.Integer(), sa.ForeignKey("parts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("finish_id", sa.Integer(), sa.ForeignKey("chemical_finishes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=text("now()")),
        sa.UniqueConstraint("part_id", "finish_id", name="uq_part_finish"),
    )
    op.create_index("ix_part_finish_selections_part_id", "part_finish_selections", ["part_id"])
    op.create_index("ix_part_finish_selections_finish_id", "part_finish_selections", ["finish_id"])

    op.create_table(
        "part_other_notes",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("part_id", sa.Integer(), sa.ForeignKey("parts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("note", sa.String(), nullable=False),
    )
    op.create_index("ix_part_other_notes_part_id", "part_other_notes", ["part_id"])

    op.create_table(
        "part_materials",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("part_id", sa.Integer(), sa.ForeignKey("parts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("part_revision_id", sa.Integer(), sa.ForeignKey("part_revisions.id", ondelete="CASCADE")),
        sa.Column("raw_material_id", sa.Integer(), sa.ForeignKey("raw_materials.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("qty_per", sa.Numeric(18, 3)),
        sa.Column("uom", sa.String()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=text("now()")),
        sa.UniqueConstraint("part_id", "part_revision_id", "raw_material_id", name="uq_part_rev_material_once"),
    )
    op.create_index("ix_part_materials_part_id", "part_materials", ["part_id"])
    op.create_index("ix_part_materials_part_revision_id", "part_materials", ["part_revision_id"])
    op.create_index("ix_part_materials_raw_material_id", "part_materials", ["raw_material_id"])

    # ======================
    # Step ↔ Machine options
    # ======================
    op.create_table(
        "step_machine_options",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("traveler_step_id", sa.Integer(), sa.ForeignKey("shop_traveler_steps.id"), nullable=False),
        sa.Column("machine_id", sa.Integer(), sa.ForeignKey("machines.id"), nullable=False),
        sa.Column("priority", sa.Integer()),
        sa.UniqueConstraint("traveler_step_id", "machine_id", name="uq_step_machine_option"),
    )
    op.create_index("ix_step_machine_options_traveler_step_id", "step_machine_options", ["traveler_step_id"])
    op.create_index("ix_step_machine_options_machine_id", "step_machine_options", ["machine_id"])
    op.create_index("ix_step_machine_option_step", "step_machine_options", ["traveler_step_id"])
    op.create_index("ix_step_machine_option_machine", "step_machine_options", ["machine_id"])

    op.create_table(
        "machine_schedule",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("machine_id", sa.Integer(), sa.ForeignKey("machines.id"), nullable=False),
        sa.Column("traveler_step_id", sa.Integer(), sa.ForeignKey("shop_traveler_steps.id"), nullable=False),
        sa.Column("planned_start", sa.DateTime(timezone=True)),
        sa.Column("planned_end", sa.DateTime(timezone=True)),
        sa.Column("status", sa.String(), nullable=False, server_default=text("'scheduled'")),
        sa.UniqueConstraint("machine_id", "traveler_step_id", name="uq_machine_step_once"),
    )
    op.create_index("ix_machine_schedule_machine", "machine_schedule", ["machine_id", "planned_start"])
    op.create_index("ix_machine_schedule_machine_id", "machine_schedule", ["machine_id"])
    op.create_index("ix_machine_schedule_traveler_step_id", "machine_schedule", ["traveler_step_id"])

    # =======================
    # Shipments / Invoicing
    # =======================
    op.create_table(
        "customer_shipments",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("po_id", sa.Integer(), sa.ForeignKey("purchase_orders.id"), nullable=False),
        sa.Column("shipped_at", sa.DateTime(timezone=True), nullable=False, server_default=text("now()")),
        sa.Column("ship_to", sa.String()),
        sa.Column("carrier", sa.String()),
        sa.Column("tracking_no", sa.String()),
        sa.Column("notes", sa.Text()),
    )
    op.create_index("ix_customer_shipments_po_id", "customer_shipments", ["po_id"])

    op.create_table(
        "customer_shipment_items",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("shipment_id", sa.Integer(), sa.ForeignKey("customer_shipments.id"), nullable=False),
        sa.Column("po_line_id", sa.Integer(), sa.ForeignKey("po_lines.id"), nullable=False),
        sa.Column("lot_id", sa.Integer(), sa.ForeignKey("production_lots.id")),
        sa.Column("qty", sa.Numeric(18, 3), nullable=False),
    )
    op.create_index("ix_customer_shipment_items_shipment_id", "customer_shipment_items", ["shipment_id"])
    op.create_index("ix_customer_shipment_items_po_line_id", "customer_shipment_items", ["po_line_id"])
    op.create_index("ix_customer_shipment_items_lot_id", "customer_shipment_items", ["lot_id"])

    op.create_table(
        "customer_invoices",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("invoice_no", sa.String(), nullable=False, unique=True),
        sa.Column("po_id", sa.Integer(), sa.ForeignKey("purchase_orders.id"), nullable=False),
        sa.Column("invoice_date", sa.Date(), nullable=False, server_default=text("CURRENT_DATE")),
        sa.Column("status", sa.String(), nullable=False, server_default=text("'open'")),
        sa.Column("notes", sa.Text()),
    )
    op.create_index("ix_customer_invoices_invoice_no", "customer_invoices", ["invoice_no"], unique=True)
    op.create_index("ix_customer_invoices_po_id", "customer_invoices", ["po_id"])

    op.create_table(
        "customer_invoice_lines",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("invoice_id", sa.Integer(), sa.ForeignKey("customer_invoices.id"), nullable=False),
        sa.Column("po_line_id", sa.Integer(), sa.ForeignKey("po_lines.id"), nullable=False),
        sa.Column("shipment_item_id", sa.Integer(), sa.ForeignKey("customer_shipment_items.id")),
        sa.Column("qty", sa.Numeric(18, 3), nullable=False),
        sa.Column("unit_price", sa.Numeric(18, 2)),
        sa.Column("amount", sa.Numeric(18, 2)),
    )
    op.create_index("ix_customer_invoice_lines_invoice_id", "customer_invoice_lines", ["invoice_id"])
    op.create_index("ix_customer_invoice_lines_po_line_id", "customer_invoice_lines", ["po_line_id"])
    op.create_index("ix_customer_invoice_lines_shipment_item_id", "customer_invoice_lines", ["shipment_item_id"])

    op.create_table(
        "customer_returns",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("po_id", sa.Integer(), sa.ForeignKey("purchase_orders.id"), nullable=False),
        sa.Column("rma_no", sa.String(), unique=True),
        sa.Column("returned_at", sa.DateTime(timezone=True), nullable=False, server_default=text("now()")),
        sa.Column("reason", sa.Text()),
        sa.Column("status", sa.String(), nullable=False, server_default=text("'received'")),
    )
    op.create_index("ix_customer_returns_po_id", "customer_returns", ["po_id"])
    op.create_index("ix_customer_returns_rma_no", "customer_returns", ["rma_no"], unique=True)

    op.create_table(
        "customer_return_items",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("return_id", sa.Integer(), sa.ForeignKey("customer_returns.id"), nullable=False),
        sa.Column("shipment_item_id", sa.Integer(), sa.ForeignKey("customer_shipment_items.id")),
        sa.Column("po_line_id", sa.Integer(), sa.ForeignKey("po_lines.id"), nullable=False),
        sa.Column("lot_id", sa.Integer(), sa.ForeignKey("production_lots.id")),
        sa.Column("qty", sa.Numeric(18, 3), nullable=False),
        sa.Column("reason_code", sa.String()),
        sa.Column("disposition", sa.String()),
    )
    op.create_index("ix_customer_return_items_return_id", "customer_return_items", ["return_id"])
    op.create_index("ix_customer_return_items_shipment_item_id", "customer_return_items", ["shipment_item_id"])
    op.create_index("ix_customer_return_items_po_line_id", "customer_return_items", ["po_line_id"])
    op.create_index("ix_customer_return_items_lot_id", "customer_return_items", ["lot_id"])

    # =================
    # Time / Payroll
    # =================
    op.create_table(
        "pay_periods",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("name", sa.String()),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default=text("'open'")),
        sa.Column("anchor", sa.String()),
        sa.Column("notes", sa.Text()),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id")),
        sa.Column("locked_by", sa.Integer(), sa.ForeignKey("users.id")),
        sa.Column("locked_at", sa.DateTime(timezone=True)),
        sa.Column("paid_at", sa.DateTime(timezone=True)),
        sa.Column("created_by_emp_id", sa.Integer(), sa.ForeignKey("employees.id")),
        sa.Column("locked_by_emp_id", sa.Integer(), sa.ForeignKey("employees.id")),
        sa.Column("paid_by_emp_id", sa.Integer(), sa.ForeignKey("employees.id")),
        sa.UniqueConstraint("start_at", "end_at", name="uq_pay_periods_range"),
        sa.CheckConstraint("end_at > start_at", name="ck_pay_periods_valid"),
    )
    op.create_index("ix_pay_periods_range", "pay_periods", ["start_at", "end_at"])

    op.create_table(
        "time_entries",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("employee_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=False),
        sa.Column("payroll_emp_id", sa.Integer(), sa.ForeignKey("employees.id", ondelete="SET NULL")),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id")),
        sa.Column("work_user_id", sa.Integer(), sa.ForeignKey("users.id")),
        sa.Column("clock_in_at", sa.DateTime(timezone=True), nullable=False, server_default=text("now()")),
        sa.Column("clock_in_method", sa.String()),
        sa.Column("clock_in_location", sa.String()),
        sa.Column("clock_out_at", sa.DateTime(timezone=True)),
        sa.Column("clock_out_method", sa.String()),
        sa.Column("clock_out_location", sa.String()),
        sa.Column("status", sa.String(), nullable=False, server_default=text("'open'")),
        sa.Column("notes", sa.Text()),
        sa.Column("pay_period_id", sa.Integer(), sa.ForeignKey("pay_periods.id")),
    )
    op.create_index("ix_time_entries_employee_id", "time_entries", ["employee_id"])
    op.create_index("ix_time_entries_emp_status", "time_entries", ["employee_id", "status"])
    op.create_index("ix_time_entries_in", "time_entries", ["clock_in_at"])
    op.create_index("ix_time_entries_out", "time_entries", ["clock_out_at"])
    op.create_index("ix_time_entries_work_user", "time_entries", ["work_user_id"])
    op.create_index("ix_time_entries_emp_work_week", "time_entries", ["employee_id", "work_user_id", "clock_in_at"])
    op.create_index("ix_time_entries_payroll_emp", "time_entries", ["payroll_emp_id"])
    op.create_index("ix_time_entries_pay_period_id", "time_entries", ["pay_period_id"])
    op.create_index("ix_time_entries_created_by_user_id", "time_entries", ["created_by_user_id"])
    op.create_index("ix_time_entries_work_user_id", "time_entries", ["work_user_id"])
    op.create_index("ix_time_entries_payroll_emp_id", "time_entries", ["payroll_emp_id"])

    op.create_table(
        "break_entries",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("time_entry_id", sa.Integer(), sa.ForeignKey("time_entries.id"), nullable=False),
        sa.Column("break_type", sa.String(), nullable=False, server_default=text("'lunch'")),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False, server_default=text("now()")),
        sa.Column("end_at", sa.DateTime(timezone=True)),
        sa.Column("method", sa.String()),
        sa.Column("location", sa.String()),
        sa.Column("notes", sa.Text()),
        sa.Column("is_paid", sa.Boolean(), nullable=False, server_default=text("false")),
    )
    op.create_index("ix_break_entries_parent", "break_entries", ["time_entry_id"])
    op.create_index("ix_break_entries_start", "break_entries", ["start_at"])
    op.create_index("ix_break_entries_end", "break_entries", ["end_at"])
    op.create_index("ix_break_entries_time_entry_id", "break_entries", ["time_entry_id"])

    op.create_table(
        "time_leaves",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("employee_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=False),
        sa.Column("leave_type", sa.String(), nullable=False),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("hours", sa.Numeric(5, 2)),
        sa.Column("is_paid", sa.Boolean(), nullable=False, server_default=text("true")),
        sa.Column("status", sa.String(), nullable=False, server_default=text("'approved'")),
        sa.Column("notes", sa.Text()),
    )
    op.create_index("ix_time_leaves_employee_id", "time_leaves", ["employee_id"])
    op.create_index("ix_time_leaves_emp_date", "time_leaves", ["employee_id", "start_at", "end_at"])

    op.create_table(
        "holidays",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("holiday_date", sa.Date(), nullable=False, unique=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("is_paid", sa.Boolean(), nullable=False, server_default=text("true")),
        sa.Column("hours", sa.Numeric(4, 2)),
        sa.Column("pay_multiplier", sa.Numeric(3, 2), nullable=False, server_default=text("1")),
    )

    op.create_table(
        "pay_rates",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("employee_id", sa.Integer(), sa.ForeignKey("employees.id"), nullable=False),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=False),
        sa.Column("hourly_rate", sa.Numeric(8, 2), nullable=False),
        sa.Column("ot_multiplier", sa.Numeric(4, 2), nullable=False, server_default=text("1.5")),
        sa.Column("dt_multiplier", sa.Numeric(4, 2), nullable=False, server_default=text("2.0")),
        sa.UniqueConstraint("employee_id", "effective_from", name="uq_pay_rates_emp_eff"),
    )
    op.create_index("ix_pay_rates_employee_id", "pay_rates", ["employee_id"])
    op.create_index("ix_pay_rates_emp_eff", "pay_rates", ["employee_id", "effective_from"])


def downgrade() -> None:
    # Drop in reverse dependency order (indexes drop with tables)
    op.drop_table("pay_rates")
    op.drop_table("holidays")
    op.drop_table("time_leaves")
    op.drop_table("break_entries")
    op.drop_table("time_entries")
    op.drop_table("pay_periods")

    op.drop_table("customer_return_items")
    op.drop_table("customer_returns")
    op.drop_table("customer_invoice_lines")
    op.drop_table("customer_invoices")
    op.drop_table("customer_shipment_items")
    op.drop_table("customer_shipments")

    op.drop_table("machine_schedule")
    op.drop_table("step_machine_options")

    op.drop_table("part_materials")
    op.drop_table("part_other_notes")
    op.drop_table("part_finish_selections")
    op.drop_table("part_process_selections")

    op.drop_table("subcon_receipt_items")
    op.drop_table("subcon_receipts")
    op.drop_table("subcon_shipment_items")
    op.drop_table("subcon_shipments")
    op.drop_table("subcon_order_lines")
    op.drop_table("subcon_orders")

    op.drop_table("lot_material_use")
    op.drop_table("raw_batches")
    op.drop_table("material_po_lines")
    op.drop_table("material_pos")

    # Remove cyclic FKs first
    op.drop_constraint("fk_production_lots_fair_record_id", "production_lots", type_="foreignkey")
    op.drop_constraint("fk_part_revisions_fair_record_id", "part_revisions", type_="foreignkey")

    op.drop_table("inspection_items")
    op.drop_table("inspection_records")

    op.drop_table("shop_traveler_steps")
    op.drop_table("shop_travelers")
    op.drop_table("production_lots")
    op.drop_table("po_lines")
    op.drop_table("part_revisions")

    op.drop_table("purchase_orders")

    op.drop_table("user_roles")
    op.drop_table("role_permissions")
    op.drop_table("users")
    op.drop_table("permissions")
    op.drop_table("roles")

    op.drop_table("chemical_finishes")
    op.drop_table("mfg_processes")
    op.drop_table("measurement_devices")
    op.drop_table("machines")
    op.drop_table("parts")
    op.drop_table("raw_materials")
    op.drop_table("employees")
    op.drop_table("customers")
    op.drop_table("suppliers")
