"""init

Revision ID: 13b9a2c7eb0e
Revises:
Create Date: 2025-09-10 11:45:44.123971

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "13b9a2c7eb0e"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""

    # ===== Base masters (no FKs out) =====
    op.create_table(
        "customers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("contact", sa.String(), nullable=True),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("phone", sa.String(), nullable=True),
        sa.Column("address", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_customers_code"), "customers", ["code"], unique=True)
    op.create_index(op.f("ix_customers_id"), "customers", ["id"], unique=False)

    op.create_table(
        "employees",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("emp_code", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("position", sa.String(), nullable=True),
        sa.Column("department", sa.String(), nullable=True),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("phone", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_employees_emp_code"), "employees", ["emp_code"], unique=True)
    op.create_index(op.f("ix_employees_id"), "employees", ["id"], unique=False)

    op.create_table(
        "holidays",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("holiday_date", sa.Date(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("is_paid", sa.Boolean(), nullable=False),
        sa.Column("hours", sa.Numeric(precision=4, scale=2), nullable=True),
        sa.Column("pay_multiplier", sa.Numeric(precision=3, scale=2), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("holiday_date"),
    )

    # ===== Machines & Measurement devices =====
    op.create_table(
        "machines",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("type", sa.String(), nullable=True),
        sa.Column("controller", sa.String(), nullable=True),
        sa.Column("axis_count", sa.Integer(), nullable=True),
        sa.Column("spindle_power_kw", sa.Numeric(precision=10, scale=3), nullable=True),
        sa.Column("max_travel_x", sa.Numeric(precision=10, scale=3), nullable=True),
        sa.Column("max_travel_y", sa.Numeric(precision=10, scale=3), nullable=True),
        sa.Column("max_travel_z", sa.Numeric(precision=10, scale=3), nullable=True),
        sa.Column("location", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_machines_code"), "machines", ["code"], unique=True)
    op.create_index("ix_machines_status", "machines", ["status"], unique=False)
    op.create_index("ix_machines_type_status", "machines", ["type", "status"], unique=False)

    op.create_table(
        "measurement_devices",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("type", sa.String(), nullable=True),
        sa.Column("brand", sa.String(), nullable=True),
        sa.Column("model", sa.String(), nullable=True),
        sa.Column("serial_no", sa.String(), nullable=True),
        sa.Column("location", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("calibration_due", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_measurement_devices_cal_due", "measurement_devices", ["calibration_due"], unique=False)
    op.create_index(op.f("ix_measurement_devices_code"), "measurement_devices", ["code"], unique=True)
    op.create_index("ix_measurement_devices_status", "measurement_devices", ["status"], unique=False)
    op.create_index("ix_measurement_devices_type", "measurement_devices", ["type"], unique=False)

    # ===== Suppliers & raw materials =====
    op.create_table(
        "suppliers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("contact", sa.String(), nullable=True),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("phone", sa.String(), nullable=True),
        sa.Column("address", sa.String(), nullable=True),
        sa.Column("payment_terms", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_suppliers_code"), "suppliers", ["code"], unique=True)

    op.create_table(
        "raw_materials",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("spec", sa.String(), nullable=True),
        sa.Column("uom", sa.String(), nullable=True),
        sa.Column("remark", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_raw_materials_code"), "raw_materials", ["code"], unique=True)

    # ===== Roles/Permissions (no outward deps) =====
    op.create_table(
        "roles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_roles_code"), "roles", ["code"], unique=True)

    op.create_table(
        "permissions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_permissions_code"), "permissions", ["code"], unique=True)

    # ===== Users / Pay periods (need employees/users) =====
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("username", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("is_superuser", sa.Boolean(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_active", "users", ["is_active"], unique=False)
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_index(op.f("ix_users_employee_id"), "users", ["employee_id"], unique=True)
    op.create_index(op.f("ix_users_username"), "users", ["username"], unique=True)

    op.create_table(
        "pay_periods",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("anchor", sa.String(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("locked_by", sa.Integer(), nullable=True),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_emp_id", sa.Integer(), nullable=True),
        sa.Column("locked_by_emp_id", sa.Integer(), nullable=True),
        sa.Column("paid_by_emp_id", sa.Integer(), nullable=True),
        sa.CheckConstraint("end_at > start_at", name="ck_pay_periods_valid"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["created_by_emp_id"], ["employees.id"]),
        sa.ForeignKeyConstraint(["locked_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["locked_by_emp_id"], ["employees.id"]),
        sa.ForeignKeyConstraint(["paid_by_emp_id"], ["employees.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("start_at", "end_at", name="uq_pay_periods_range"),
    )
    op.create_index("ix_pay_periods_range", "pay_periods", ["start_at", "end_at"], unique=False)

    # ===== Sales PO (needs customers) =====
    op.create_table(
        "purchase_orders",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("po_number", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_purchase_orders_id"), "purchase_orders", ["id"], unique=False)
    op.create_index(op.f("ix_purchase_orders_po_number"), "purchase_orders", ["po_number"], unique=True)

    # ===== Parts then Part Revisions =====
    op.create_table(
        "parts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("part_no", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("default_uom", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_parts_part_no"), "parts", ["part_no"], unique=True)

    # NOTE: defer fair_record_id FK to end
    op.create_table(
        "part_revisions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("part_id", sa.Integer(), nullable=False),
        sa.Column("rev", sa.String(), nullable=False),
        sa.Column("drawing_file", sa.String(), nullable=True),
        sa.Column("spec", sa.String(), nullable=True),
        sa.Column("is_current", sa.Boolean(), nullable=True),
        sa.Column("fair_record_id", sa.Integer(), nullable=True),  # FK added later
        sa.Column("fair_no_cache", sa.String(), nullable=True),
        sa.Column("fair_date_cache", sa.Date(), nullable=True),
        sa.ForeignKeyConstraint(["part_id"], ["parts.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("fair_record_id"),
        sa.UniqueConstraint("part_id", "id", name="uq_part_id_id"),
        sa.UniqueConstraint("part_id", "rev", name="uq_part_rev"),
    )

    # ===== PO lines (needs purchase_orders, parts, part_revisions) =====
    op.create_table(
        "po_lines",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("po_id", sa.Integer(), nullable=False),
        sa.Column("part_id", sa.Integer(), nullable=False),
        sa.Column("revision_id", sa.Integer(), nullable=True),
        sa.Column("qty_ordered", sa.Numeric(precision=18, scale=3), nullable=False),
        sa.Column("unit_price", sa.Numeric(precision=18, scale=2), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["part_id", "revision_id"], ["part_revisions.part_id", "part_revisions.id"], name="fk_poline_part_rev_pair"),
        sa.ForeignKeyConstraint(["part_id"], ["parts.id"]),
        sa.ForeignKeyConstraint(["po_id"], ["purchase_orders.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_po_lines_part_id"), "po_lines", ["part_id"], unique=False)
    op.create_index("ix_po_lines_part_rev", "po_lines", ["part_id", "revision_id"], unique=False)
    op.create_index("ix_po_lines_po", "po_lines", ["po_id"], unique=False)
    op.create_index(op.f("ix_po_lines_po_id"), "po_lines", ["po_id"], unique=False)
    op.create_index(op.f("ix_po_lines_revision_id"), "po_lines", ["revision_id"], unique=False)

    # ===== Production lots (defer FAIR link) =====
    op.create_table(
        "production_lots",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("lot_no", sa.String(), nullable=False),
        sa.Column("part_id", sa.Integer(), nullable=False),
        sa.Column("part_revision_id", sa.Integer(), nullable=True),
        sa.Column("po_id", sa.Integer(), nullable=True),
        sa.Column("po_line_id", sa.Integer(), nullable=True),
        sa.Column("planned_qty", sa.Integer(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("fair_required", sa.Boolean(), nullable=False),
        sa.Column("fair_record_id", sa.Integer(), nullable=True),  # FK added later
        sa.ForeignKeyConstraint(["part_id"], ["parts.id"]),
        sa.ForeignKeyConstraint(["part_revision_id"], ["part_revisions.id"]),
        sa.ForeignKeyConstraint(["po_id"], ["purchase_orders.id"]),
        sa.ForeignKeyConstraint(["po_line_id"], ["po_lines.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_production_lots_fair_record_id"), "production_lots", ["fair_record_id"], unique=False)
    op.create_index(op.f("ix_production_lots_lot_no"), "production_lots", ["lot_no"], unique=True)
    op.create_index(op.f("ix_production_lots_part_revision_id"), "production_lots", ["part_revision_id"], unique=False)
    op.create_index(op.f("ix_production_lots_po_id"), "production_lots", ["po_id"], unique=False)
    op.create_index(op.f("ix_production_lots_po_line_id"), "production_lots", ["po_line_id"], unique=False)

    # ===== Travelers & steps (need lots, employees, machines) =====
    op.create_table(
        "shop_travelers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("lot_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["created_by_id"], ["employees.id"]),
        sa.ForeignKeyConstraint(["lot_id"], ["production_lots.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_shop_travelers_status", "shop_travelers", ["status"], unique=False)

    op.create_table(
        "shop_traveler_steps",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("traveler_id", sa.Integer(), nullable=False),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("step_code", sa.String(), nullable=True),
        sa.Column("step_name", sa.String(), nullable=False),
        sa.Column("station", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("operator_id", sa.Integer(), nullable=True),
        sa.Column("machine_id", sa.Integer(), nullable=True),
        sa.Column("qa_required", sa.Boolean(), nullable=False),
        sa.Column("qa_result", sa.String(), nullable=True),
        sa.Column("qa_notes", sa.Text(), nullable=True),
        sa.Column("qty_receive", sa.Numeric(precision=18, scale=3), nullable=False),
        sa.Column("qty_accept", sa.Numeric(precision=18, scale=3), nullable=False),
        sa.Column("qty_reject", sa.Numeric(precision=18, scale=3), nullable=False),
        sa.ForeignKeyConstraint(["machine_id"], ["machines.id"]),
        sa.ForeignKeyConstraint(["operator_id"], ["employees.id"]),
        sa.ForeignKeyConstraint(["traveler_id"], ["shop_travelers.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("traveler_id", "seq", name="uq_traveler_seq"),
    )
    op.create_index("ix_traveler_steps_machine", "shop_traveler_steps", ["machine_id"], unique=False)
    op.create_index("ix_traveler_steps_operator", "shop_traveler_steps", ["operator_id"], unique=False)
    op.create_index("ix_traveler_steps_status", "shop_traveler_steps", ["status"], unique=False)

    # ===== Inspection records (defer FKs to steps & part_revisions) =====
    op.create_table(
        "inspection_records",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("traveler_step_id", sa.Integer(), nullable=False),  # FK added later
        sa.Column("is_fair", sa.Boolean(), nullable=False),
        sa.Column("fair_no", sa.String(), nullable=True),
        sa.Column("fair_doc_file", sa.String(), nullable=True),
        sa.Column("fair_date", sa.Date(), nullable=True),
        sa.Column("part_revision_id", sa.Integer(), nullable=True),  # FK added later
        sa.Column("inspector_id", sa.Integer(), nullable=True),
        sa.Column("device_id", sa.Integer(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("overall_result", sa.String(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["inspector_id"], ["employees.id"]),
        sa.ForeignKeyConstraint(["device_id"], ["measurement_devices.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_inspection_records_fair_rev", "inspection_records", ["part_revision_id", "is_fair"], unique=False)
    op.create_index(op.f("ix_inspection_records_part_revision_id"), "inspection_records", ["part_revision_id"], unique=False)
    op.create_index("ix_inspection_records_result", "inspection_records", ["overall_result"], unique=False)
    op.create_index("ix_inspection_records_step", "inspection_records", ["traveler_step_id"], unique=False)

    # ===== QA detail tables =====
    op.create_table(
        "device_calibrations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("device_id", sa.Integer(), nullable=False),
        sa.Column("calibrated_at", sa.Date(), nullable=False),
        sa.Column("due_at", sa.Date(), nullable=True),
        sa.Column("performed_by", sa.String(), nullable=True),
        sa.Column("result", sa.String(), nullable=True),
        sa.Column("certificate_file", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["device_id"], ["measurement_devices.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_device_calibrations_device", "device_calibrations", ["device_id", "calibrated_at"], unique=False)

    op.create_table(
        "inspection_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("record_id", sa.Integer(), nullable=False),
        sa.Column("characteristic", sa.String(), nullable=False),
        sa.Column("nominal_value", sa.Numeric(precision=18, scale=4), nullable=True),
        sa.Column("tol_lower", sa.Numeric(precision=18, scale=4), nullable=True),
        sa.Column("tol_upper", sa.Numeric(precision=18, scale=4), nullable=True),
        sa.Column("measured_value", sa.Numeric(precision=18, scale=4), nullable=True),
        sa.Column("unit", sa.String(), nullable=True),
        sa.Column("result", sa.String(), nullable=True),
        sa.Column("device_id", sa.Integer(), nullable=True),
        sa.Column("attachment", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["device_id"], ["measurement_devices.id"]),
        sa.ForeignKeyConstraint(["record_id"], ["inspection_records.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_inspection_items_record", "inspection_items", ["record_id"], unique=False)
    op.create_index("ix_inspection_items_result", "inspection_items", ["result"], unique=False)

    # ===== Scheduling =====
    op.create_table(
        "machine_schedule",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("machine_id", sa.Integer(), nullable=False),
        sa.Column("traveler_step_id", sa.Integer(), nullable=False),
        sa.Column("planned_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("planned_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["machine_id"], ["machines.id"]),
        sa.ForeignKeyConstraint(["traveler_step_id"], ["shop_traveler_steps.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("machine_id", "traveler_step_id", name="uq_machine_step_once"),
    )
    op.create_index("ix_machine_schedule_machine", "machine_schedule", ["machine_id", "planned_start"], unique=False)

    op.create_table(
        "step_machine_options",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("traveler_step_id", sa.Integer(), nullable=False),
        sa.Column("machine_id", sa.Integer(), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["machine_id"], ["machines.id"]),
        sa.ForeignKeyConstraint(["traveler_step_id"], ["shop_traveler_steps.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("traveler_step_id", "machine_id", name="uq_step_machine_option"),
    )
    op.create_index("ix_step_machine_option_machine", "step_machine_options", ["machine_id"], unique=False)
    op.create_index("ix_step_machine_option_step", "step_machine_options", ["traveler_step_id"], unique=False)

    # ===== Material purchasing =====
    op.create_table(
        "material_pos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("po_number", sa.String(), nullable=False),
        sa.Column("supplier_id", sa.Integer(), nullable=False),
        sa.Column("order_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["supplier_id"], ["suppliers.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_material_pos_po_number"), "material_pos", ["po_number"], unique=True)

    op.create_table(
        "material_po_lines",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("po_id", sa.Integer(), nullable=False),
        sa.Column("material_id", sa.Integer(), nullable=False),
        sa.Column("qty_ordered", sa.Numeric(precision=18, scale=3), nullable=False),
        sa.Column("unit_price", sa.Numeric(precision=18, scale=2), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.ForeignKeyConstraint(["material_id"], ["raw_materials.id"]),
        sa.ForeignKeyConstraint(["po_id"], ["material_pos.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_material_po_lines_po_id"), "material_po_lines", ["po_id"], unique=False)

    op.create_table(
        "raw_batches",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("material_id", sa.Integer(), nullable=False),
        sa.Column("supplier_id", sa.Integer(), nullable=True),
        sa.Column("material_po_line_id", sa.Integer(), nullable=True),
        sa.Column("batch_no", sa.String(), nullable=False),
        sa.Column("supplier_batch_no", sa.String(), nullable=True),
        sa.Column("mill_name", sa.String(), nullable=True),
        sa.Column("mill_heat_no", sa.String(), nullable=True),
        sa.Column("received_at", sa.Date(), nullable=True),
        sa.Column("qty_received", sa.Numeric(precision=18, scale=3), nullable=False),
        sa.Column("qty_used", sa.Numeric(precision=18, scale=3), nullable=False),
        sa.Column("cert_file", sa.String(), nullable=True),
        sa.Column("location", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["material_id"], ["raw_materials.id"]),
        sa.ForeignKeyConstraint(["material_po_line_id"], ["material_po_lines.id"]),
        sa.ForeignKeyConstraint(["supplier_id"], ["suppliers.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("material_id", "batch_no", "supplier_id", name="uq_batch_material_supplier"),
    )
    op.create_index(op.f("ix_raw_batches_batch_no"), "raw_batches", ["batch_no"], unique=False)
    op.create_index("ix_raw_batches_mat_recv", "raw_batches", ["material_id", "received_at"], unique=False)

    op.create_table(
        "lot_material_use",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("lot_id", sa.Integer(), nullable=False),
        sa.Column("batch_id", sa.Integer(), nullable=False),
        sa.Column("qty", sa.Numeric(precision=18, scale=3), nullable=False),
        sa.ForeignKeyConstraint(["batch_id"], ["raw_batches.id"]),
        sa.ForeignKeyConstraint(["lot_id"], ["production_lots.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_lmu_batch", "lot_material_use", ["batch_id"], unique=False)
    op.create_index("ix_lmu_lot", "lot_material_use", ["lot_id"], unique=False)

    # ===== Subcontracting =====
    op.create_table(
        "subcon_orders",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("supplier_id", sa.Integer(), nullable=False),
        sa.Column("ref_no", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["supplier_id"], ["suppliers.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_subcon_orders_supplier_status", "subcon_orders", ["supplier_id", "status"], unique=False)

    op.create_table(
        "subcon_order_lines",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("traveler_step_id", sa.Integer(), nullable=False),
        sa.Column("qty_planned", sa.Numeric(precision=18, scale=3), nullable=False),
        sa.Column("unit_cost", sa.Numeric(precision=18, scale=2), nullable=True),
        sa.ForeignKeyConstraint(["order_id"], ["subcon_orders.id"]),
        sa.ForeignKeyConstraint(["traveler_step_id"], ["shop_traveler_steps.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("order_id", "traveler_step_id", name="uq_order_step"),
    )
    op.create_index("ix_subcon_order_lines_step", "subcon_order_lines", ["traveler_step_id"], unique=False)

    op.create_table(
        "subcon_shipments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("shipped_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("shipped_by", sa.String(), nullable=True),
        sa.Column("package_no", sa.String(), nullable=True),
        sa.Column("carrier", sa.String(), nullable=True),
        sa.Column("tracking_no", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["order_id"], ["subcon_orders.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "subcon_shipment_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("shipment_id", sa.Integer(), nullable=False),
        sa.Column("traveler_step_id", sa.Integer(), nullable=False),
        sa.Column("qty", sa.Numeric(precision=18, scale=3), nullable=False),
        sa.ForeignKeyConstraint(["shipment_id"], ["subcon_shipments.id"]),
        sa.ForeignKeyConstraint(["traveler_step_id"], ["shop_traveler_steps.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_subcon_shipment_items_step", "subcon_shipment_items", ["traveler_step_id"], unique=False)

    op.create_table(
        "subcon_receipts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("received_by", sa.String(), nullable=True),
        sa.Column("doc_no", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["order_id"], ["subcon_orders.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "subcon_receipt_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("receipt_id", sa.Integer(), nullable=False),
        sa.Column("traveler_step_id", sa.Integer(), nullable=False),
        sa.Column("qty_received", sa.Numeric(precision=18, scale=3), nullable=False),
        sa.Column("qty_rejected", sa.Numeric(precision=18, scale=3), nullable=False),
        sa.Column("scrap_qty", sa.Numeric(precision=18, scale=3), nullable=False),
        sa.Column("qa_result", sa.String(), nullable=True),
        sa.Column("qa_notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["receipt_id"], ["subcon_receipts.id"]),
        sa.ForeignKeyConstraint(["traveler_step_id"], ["shop_traveler_steps.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_subcon_receipt_items_step", "subcon_receipt_items", ["traveler_step_id"], unique=False)

    # ===== Time tracking =====
    op.create_table(
        "time_leaves",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("leave_type", sa.String(), nullable=False),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("hours", sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column("is_paid", sa.Boolean(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_time_leaves_emp_date", "time_leaves", ["employee_id", "start_at", "end_at"], unique=False)
    op.create_index(op.f("ix_time_leaves_employee_id"), "time_leaves", ["employee_id"], unique=False)

    op.create_table(
        "pay_rates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("effective_from", sa.DateTime(), nullable=False),
        sa.Column("hourly_rate", sa.Numeric(precision=8, scale=2), nullable=False),
        sa.Column("ot_multiplier", sa.Numeric(precision=4, scale=2), nullable=True),
        sa.Column("dt_multiplier", sa.Numeric(precision=4, scale=2), nullable=True),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("employee_id", "effective_from", name="uq_pay_rates_emp_eff"),
    )
    op.create_index("ix_pay_rates_emp_eff", "pay_rates", ["employee_id", "effective_from"], unique=False)
    op.create_index(op.f("ix_pay_rates_employee_id"), "pay_rates", ["employee_id"], unique=False)

    op.create_table(
        "time_entries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("payroll_emp_id", sa.Integer(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("work_user_id", sa.Integer(), nullable=True),
        sa.Column("clock_in_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("clock_in_method", sa.String(), nullable=True),
        sa.Column("clock_in_location", sa.String(), nullable=True),
        sa.Column("clock_out_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("clock_out_method", sa.String(), nullable=True),
        sa.Column("clock_out_location", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("pay_period_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"]),
        sa.ForeignKeyConstraint(["pay_period_id"], ["pay_periods.id"]),
        sa.ForeignKeyConstraint(["payroll_emp_id"], ["employees.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["work_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_time_entries_emp_status", "time_entries", ["employee_id", "status"], unique=False)
    op.create_index("ix_time_entries_emp_work_week", "time_entries", ["employee_id", "work_user_id", "clock_in_at"], unique=False)
    op.create_index(op.f("ix_time_entries_employee_id"), "time_entries", ["employee_id"], unique=False)
    op.create_index("ix_time_entries_in", "time_entries", ["clock_in_at"], unique=False)
    op.create_index("ix_time_entries_out", "time_entries", ["clock_out_at"], unique=False)
    op.create_index(op.f("ix_time_entries_pay_period_id"), "time_entries", ["pay_period_id"], unique=False)
    op.create_index("ix_time_entries_payroll_emp", "time_entries", ["payroll_emp_id"], unique=False)
    op.create_index(op.f("ix_time_entries_payroll_emp_id"), "time_entries", ["payroll_emp_id"], unique=False)
    op.create_index("ix_time_entries_work_user", "time_entries", ["work_user_id"], unique=False)
    op.create_index(op.f("ix_time_entries_work_user_id"), "time_entries", ["work_user_id"], unique=False)

    op.create_table(
        "break_entries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("time_entry_id", sa.Integer(), nullable=False),
        sa.Column("break_type", sa.String(), nullable=False),
        sa.Column("start_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("method", sa.String(), nullable=True),
        sa.Column("location", sa.String(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_paid", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["time_entry_id"], ["time_entries.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_break_entries_end", "break_entries", ["end_at"], unique=False)
    op.create_index("ix_break_entries_parent", "break_entries", ["time_entry_id"], unique=False)
    op.create_index("ix_break_entries_start", "break_entries", ["start_at"], unique=False)
    op.create_index(op.f("ix_break_entries_time_entry_id"), "break_entries", ["time_entry_id"], unique=False)

    # ===== Sales fulfillment & billing =====
    op.create_table(
        "customer_shipments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("po_id", sa.Integer(), nullable=False),
        sa.Column("shipped_at", sa.DateTime(), nullable=False),
        sa.Column("ship_to", sa.String(), nullable=True),
        sa.Column("carrier", sa.String(), nullable=True),
        sa.Column("tracking_no", sa.String(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["po_id"], ["purchase_orders.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_customer_shipments_po_id"), "customer_shipments", ["po_id"], unique=False)

    op.create_table(
        "customer_shipment_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("shipment_id", sa.Integer(), nullable=False),
        sa.Column("po_line_id", sa.Integer(), nullable=False),
        sa.Column("lot_id", sa.Integer(), nullable=True),
        sa.Column("qty", sa.Numeric(precision=18, scale=3), nullable=False),
        sa.ForeignKeyConstraint(["lot_id"], ["production_lots.id"]),
        sa.ForeignKeyConstraint(["po_line_id"], ["po_lines.id"]),
        sa.ForeignKeyConstraint(["shipment_id"], ["customer_shipments.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_customer_shipment_items_lot_id"), "customer_shipment_items", ["lot_id"], unique=False)
    op.create_index(op.f("ix_customer_shipment_items_po_line_id"), "customer_shipment_items", ["po_line_id"], unique=False)
    op.create_index(op.f("ix_customer_shipment_items_shipment_id"), "customer_shipment_items", ["shipment_id"], unique=False)

    op.create_table(
        "customer_invoices",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("invoice_no", sa.String(), nullable=False),
        sa.Column("po_id", sa.Integer(), nullable=False),
        sa.Column("invoice_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["po_id"], ["purchase_orders.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_customer_invoices_invoice_no"), "customer_invoices", ["invoice_no"], unique=True)
    op.create_index(op.f("ix_customer_invoices_po_id"), "customer_invoices", ["po_id"], unique=False)

    op.create_table(
        "customer_invoice_lines",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("invoice_id", sa.Integer(), nullable=False),
        sa.Column("po_line_id", sa.Integer(), nullable=False),
        sa.Column("shipment_item_id", sa.Integer(), nullable=True),
        sa.Column("qty", sa.Numeric(precision=18, scale=3), nullable=False),
        sa.Column("unit_price", sa.Numeric(precision=18, scale=2), nullable=True),
        sa.Column("amount", sa.Numeric(precision=18, scale=2), nullable=True),
        sa.ForeignKeyConstraint(["invoice_id"], ["customer_invoices.id"]),
        sa.ForeignKeyConstraint(["po_line_id"], ["po_lines.id"]),
        sa.ForeignKeyConstraint(["shipment_item_id"], ["customer_shipment_items.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_customer_invoice_lines_invoice_id"), "customer_invoice_lines", ["invoice_id"], unique=False)

    op.create_table(
        "customer_returns",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("po_id", sa.Integer(), nullable=False),
        sa.Column("rma_no", sa.String(), nullable=True),
        sa.Column("returned_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("status", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["po_id"], ["purchase_orders.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_customer_returns_po_id"), "customer_returns", ["po_id"], unique=False)
    op.create_index(op.f("ix_customer_returns_rma_no"), "customer_returns", ["rma_no"], unique=True)

    op.create_table(
        "customer_return_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("return_id", sa.Integer(), nullable=False),
        sa.Column("shipment_item_id", sa.Integer(), nullable=True),
        sa.Column("po_line_id", sa.Integer(), nullable=False),
        sa.Column("lot_id", sa.Integer(), nullable=True),
        sa.Column("qty", sa.Numeric(precision=18, scale=3), nullable=False),
        sa.Column("reason_code", sa.String(), nullable=True),
        sa.Column("disposition", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["lot_id"], ["production_lots.id"]),
        sa.ForeignKeyConstraint(["po_line_id"], ["po_lines.id"]),
        sa.ForeignKeyConstraint(["return_id"], ["customer_returns.id"]),
        sa.ForeignKeyConstraint(["shipment_item_id"], ["customer_shipment_items.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_customer_return_items_lot_id"), "customer_return_items", ["lot_id"], unique=False)
    op.create_index(op.f("ix_customer_return_items_po_line_id"), "customer_return_items", ["po_line_id"], unique=False)
    op.create_index(op.f("ix_customer_return_items_return_id"), "customer_return_items", ["return_id"], unique=False)
    op.create_index(op.f("ix_customer_return_items_shipment_item_id"), "customer_return_items", ["shipment_item_id"], unique=False)

    # ===== RBAC link tables =====
    op.create_table(
        "role_permissions",
        sa.Column("role_id", sa.Integer(), nullable=False),
        sa.Column("permission_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["permission_id"], ["permissions.id"]),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"]),
        sa.PrimaryKeyConstraint("role_id", "permission_id"),
    )

    op.create_table(
        "user_roles",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("role_id", sa.Integer(), nullable=False),
        sa.Column("assigned_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "role_id"),
    )

    # ======== Deferred FKs to break cycles (ADD NOW) ========
    # inspection_records.part_revision_id -> part_revisions.id
    op.create_foreign_key(
        "fk_insp_part_revision",
        "inspection_records",
        "part_revisions",
        ["part_revision_id"],
        ["id"],
        ondelete="SET NULL",
    )
    # inspection_records.traveler_step_id -> shop_traveler_steps.id
    op.create_foreign_key(
        "fk_insp_traveler_step",
        "inspection_records",
        "shop_traveler_steps",
        ["traveler_step_id"],
        ["id"],
    )
    # part_revisions.fair_record_id -> inspection_records.id
    op.create_foreign_key(
        "fk_pr_fair_record",
        "part_revisions",
        "inspection_records",
        ["fair_record_id"],
        ["id"],
        ondelete="SET NULL",
    )
    # production_lots.fair_record_id -> inspection_records.id
    op.create_foreign_key(
        "fk_lot_fair_record",
        "production_lots",
        "inspection_records",
        ["fair_record_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Drop deferred FKs first
    with op.batch_alter_table("production_lots") as b:
        try:
            b.drop_constraint("fk_lot_fair_record", type_="foreignkey")
        except Exception:
            pass
    with op.batch_alter_table("part_revisions") as b:
        try:
            b.drop_constraint("fk_pr_fair_record", type_="foreignkey")
        except Exception:
            pass
    with op.batch_alter_table("inspection_records") as b:
        try:
            b.drop_constraint("fk_insp_traveler_step", type_="foreignkey")
        except Exception:
            pass
        try:
            b.drop_constraint("fk_insp_part_revision", type_="foreignkey")
        except Exception:
            pass

    # Now drop in safe reverse order
    op.drop_table("user_roles")
    op.drop_table("role_permissions")

    op.drop_index(op.f("ix_customer_return_items_shipment_item_id"), table_name="customer_return_items")
    op.drop_index(op.f("ix_customer_return_items_return_id"), table_name="customer_return_items")
    op.drop_index(op.f("ix_customer_return_items_po_line_id"), table_name="customer_return_items")
    op.drop_index(op.f("ix_customer_return_items_lot_id"), table_name="customer_return_items")
    op.drop_table("customer_return_items")

    op.drop_index(op.f("ix_customer_invoice_lines_invoice_id"), table_name="customer_invoice_lines")
    op.drop_table("customer_invoice_lines")

    op.drop_index(op.f("ix_break_entries_time_entry_id"), table_name="break_entries")
    op.drop_index("ix_break_entries_start", table_name="break_entries")
    op.drop_index("ix_break_entries_parent", table_name="break_entries")
    op.drop_index("ix_break_entries_end", table_name="break_entries")
    op.drop_table("break_entries")

    op.drop_index(op.f("ix_time_entries_work_user_id"), table_name="time_entries")
    op.drop_index("ix_time_entries_work_user", table_name="time_entries")
    op.drop_index(op.f("ix_time_entries_payroll_emp_id"), table_name="time_entries")
    op.drop_index("ix_time_entries_payroll_emp", table_name="time_entries")
    op.drop_index(op.f("ix_time_entries_pay_period_id"), table_name="time_entries")
    op.drop_index("ix_time_entries_out", table_name="time_entries")
    op.drop_index("ix_time_entries_in", table_name="time_entries")
    op.drop_index(op.f("ix_time_entries_employee_id"), table_name="time_entries")
    op.drop_index("ix_time_entries_emp_work_week", table_name="time_entries")
    op.drop_index("ix_time_entries_emp_status", table_name="time_entries")
    op.drop_table("time_entries")

    op.drop_index("ix_subcon_shipment_items_step", table_name="subcon_shipment_items")
    op.drop_table("subcon_shipment_items")
    op.drop_table("subcon_shipments")

    op.drop_index("ix_subcon_receipt_items_step", table_name="subcon_receipt_items")
    op.drop_table("subcon_receipt_items")
    op.drop_table("subcon_receipts")

    op.drop_index("ix_lmu_lot", table_name="lot_material_use")
    op.drop_index("ix_lmu_batch", table_name="lot_material_use")
    op.drop_table("lot_material_use")

    op.drop_index("ix_raw_batches_mat_recv", table_name="raw_batches")
    op.drop_index(op.f("ix_raw_batches_batch_no"), table_name="raw_batches")
    op.drop_table("raw_batches")

    op.drop_index(op.f("ix_material_po_lines_po_id"), table_name="material_po_lines")
    op.drop_table("material_po_lines")

    op.drop_index(op.f("ix_customer_shipments_po_id"), table_name="customer_shipments")
    op.drop_table("customer_shipments")

    op.drop_index(op.f("ix_customer_returns_rma_no"), table_name="customer_returns")
    op.drop_index(op.f("ix_customer_returns_po_id"), table_name="customer_returns")
    op.drop_table("customer_returns")

    op.drop_index(op.f("ix_customer_invoices_po_id"), table_name="customer_invoices")
    op.drop_index(op.f("ix_customer_invoices_invoice_no"), table_name="customer_invoices")
    op.drop_table("customer_invoices")

    op.drop_index("ix_machine_schedule_machine", table_name="machine_schedule")
    op.drop_table("machine_schedule")

    op.drop_index("ix_step_machine_option_step", table_name="step_machine_options")
    op.drop_index("ix_step_machine_option_machine", table_name="step_machine_options")
    op.drop_table("step_machine_options")

    op.drop_index("ix_inspection_items_result", table_name="inspection_items")
    op.drop_index("ix_inspection_items_record", table_name="inspection_items")
    op.drop_table("inspection_items")

    op.drop_index("ix_device_calibrations_device", table_name="device_calibrations")
    op.drop_table("device_calibrations")

    op.drop_index("ix_shop_travelers_status", table_name="shop_travelers")
    op.drop_table("shop_travelers")

    op.drop_index("ix_traveler_steps_status", table_name="shop_traveler_steps")
    op.drop_index("ix_traveler_steps_operator", table_name="shop_traveler_steps")
    op.drop_index("ix_traveler_steps_machine", table_name="shop_traveler_steps")
    op.drop_table("shop_traveler_steps")

    op.drop_index(op.f("ix_production_lots_po_line_id"), table_name="production_lots")
    op.drop_index(op.f("ix_production_lots_po_id"), table_name="production_lots")
    op.drop_index(op.f("ix_production_lots_part_revision_id"), table_name="production_lots")
    op.drop_index(op.f("ix_production_lots_lot_no"), table_name="production_lots")
    op.drop_index(op.f("ix_production_lots_fair_record_id"), table_name="production_lots")
    op.drop_table("production_lots")

    op.drop_index(op.f("ix_po_lines_revision_id"), table_name="po_lines")
    op.drop_index(op.f("ix_po_lines_po_id"), table_name="po_lines")
    op.drop_index("ix_po_lines_po", table_name="po_lines")
    op.drop_index("ix_po_lines_part_rev", table_name="po_lines")
    op.drop_index(op.f("ix_po_lines_part_id"), table_name="po_lines")
    op.drop_table("po_lines")

    op.drop_index(op.f("ix_parts_part_no"), table_name="parts")
    op.drop_table("parts")

    op.drop_table("part_revisions")

    op.drop_index(op.f("ix_purchase_orders_po_number"), table_name="purchase_orders")
    op.drop_index(op.f("ix_purchase_orders_id"), table_name="purchase_orders")
    op.drop_table("purchase_orders")

    op.drop_index(op.f("ix_pay_periods_employee_id"), table_name=None)  # safe no-op if not present
    op.drop_index("ix_pay_periods_range", table_name="pay_periods")
    op.drop_table("pay_periods")

    op.drop_index(op.f("ix_pay_rates_employee_id"), table_name="pay_rates")
    op.drop_index("ix_pay_rates_emp_eff", table_name="pay_rates")
    op.drop_table("pay_rates")

    op.drop_index(op.f("ix_permissions_code"), table_name="permissions")
    op.drop_table("permissions")

    op.drop_index(op.f("ix_roles_code"), table_name="roles")
    op.drop_table("roles")

    op.drop_index(op.f("ix_raw_materials_code"), table_name="raw_materials")
    op.drop_table("raw_materials")

    op.drop_index(op.f("ix_suppliers_code"), table_name="suppliers")
    op.drop_table("suppliers")

    op.drop_index("ix_inspection_records_step", table_name="inspection_records")
    op.drop_index("ix_inspection_records_result", table_name="inspection_records")
    op.drop_index(op.f("ix_inspection_records_part_revision_id"), table_name="inspection_records")
    op.drop_index("ix_inspection_records_fair_rev", table_name="inspection_records")
    op.drop_table("inspection_records")

    op.drop_index("ix_machines_type_status", table_name="machines")
    op.drop_index("ix_machines_status", table_name="machines")
    op.drop_index(op.f("ix_machines_code"), table_name="machines")
    op.drop_table("machines")

    op.drop_index("ix_measurement_devices_type", table_name="measurement_devices")
    op.drop_index("ix_measurement_devices_status", table_name="measurement_devices")
    op.drop_index(op.f("ix_measurement_devices_code"), table_name="measurement_devices")
    op.drop_index("ix_measurement_devices_cal_due", table_name="measurement_devices")
    op.drop_table("measurement_devices")

    op.drop_table("holidays")

    op.drop_index(op.f("ix_employees_id"), table_name="employees")
    op.drop_index(op.f("ix_employees_emp_code"), table_name="employees")
    op.drop_table("employees")

    op.drop_index(op.f("ix_customers_id"), table_name="customers")
    op.drop_index(op.f("ix_customers_code"), table_name="customers")
    op.drop_table("customers")
