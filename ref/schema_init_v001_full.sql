-- =========================================================
-- Topnotch MFG – Initial Schema v001 (FULL)
-- Includes: employees, QR for lots, customers, parts, PO, lots, workflow, QA,
--           materials & inventory, attachments, addresses/contacts
-- Database: PostgreSQL
-- =========================================================
BEGIN;

-- ========== 0) Employees ==========
CREATE TABLE employees (
  id              BIGSERIAL PRIMARY KEY,
  employee_code   TEXT UNIQUE,          -- optional human code
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  position        TEXT,                 -- Operator, QA, Shipping, etc.
  department      TEXT,
  phone           TEXT,
  email           TEXT UNIQUE,
  status          TEXT CHECK (status IN ('active','inactive','on_leave')) DEFAULT 'active',
  hired_at        DATE,
  extras          JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_employees_name ON employees(last_name, first_name);

-- ========== 1) Customers, Addresses, Contacts ==========
CREATE TABLE customers (
  id                BIGSERIAL PRIMARY KEY,
  customer_code     TEXT UNIQUE NOT NULL,
  name              TEXT NOT NULL,
  type              TEXT CHECK (type IN ('company','individual','organization')),
  phone             TEXT,
  email             TEXT,
  website           TEXT,
  billing_address   TEXT,
  shipping_address  TEXT,
  notes             TEXT,
  extras            JSONB DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_customers_code ON customers(customer_code);
CREATE INDEX idx_customers_name ON customers(name);

CREATE TABLE customer_addresses (
  id                    BIGSERIAL PRIMARY KEY,
  customer_id           BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label                 TEXT,
  addr_line1            TEXT NOT NULL,
  addr_line2            TEXT,
  city                  TEXT,
  state                 TEXT,
  postal_code           TEXT,
  country               TEXT DEFAULT 'US',
  type                  TEXT NOT NULL CHECK (type IN ('billing','shipping','other')),
  is_default_billing    BOOLEAN DEFAULT FALSE,
  is_default_shipping   BOOLEAN DEFAULT FALSE,
  notes                 TEXT,
  extras                JSONB DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_caddr_customer ON customer_addresses(customer_id);
CREATE UNIQUE INDEX ux_caddr_default_billing
  ON customer_addresses(customer_id) WHERE is_default_billing = TRUE;
CREATE UNIQUE INDEX ux_caddr_default_shipping
  ON customer_addresses(customer_id) WHERE is_default_shipping = TRUE;

CREATE TABLE customer_contacts (
  id            BIGSERIAL PRIMARY KEY,
  customer_id   BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  role          TEXT,
  email         TEXT,
  phone         TEXT,
  is_primary    BOOLEAN DEFAULT FALSE,
  notify_po     BOOLEAN DEFAULT TRUE,
  notify_qa     BOOLEAN DEFAULT FALSE,
  notify_ship   BOOLEAN DEFAULT TRUE,
  notes         TEXT,
  extras        JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_ccontacts_customer ON customer_contacts(customer_id);
CREATE UNIQUE INDEX ux_ccontacts_primary
  ON customer_contacts(customer_id) WHERE is_primary = TRUE;

-- ========== 2) Parts ==========
CREATE TABLE parts (
  id            BIGSERIAL PRIMARY KEY,
  part_number   TEXT UNIQUE NOT NULL,
  description   TEXT,
  fair_no       TEXT,
  extras        JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_parts_part_number ON parts(part_number);

-- ========== 3) Customer PO & Lines ==========
CREATE TABLE pos (
  id                 BIGSERIAL PRIMARY KEY,
  customer_id        BIGINT REFERENCES customers(id),
  po_number          TEXT UNIQUE NOT NULL,
  status             TEXT CHECK (status IN ('open','in_progress','closed')) DEFAULT 'open',
  urgent             BOOLEAN DEFAULT FALSE,
  last_update        TIMESTAMPTZ,
  ship_date          DATE,
  date_due           DATE,
  start_mfg_date     DATE,
  shop_traveler_ref  TEXT,
  fair_long_note     TEXT,
  remarks            TEXT,
  extras             JSONB DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_pos_customer ON pos(customer_id);
CREATE INDEX idx_pos_duedate ON pos(date_due);

CREATE TABLE po_lines (
  id                   BIGSERIAL PRIMARY KEY,
  po_id                BIGINT NOT NULL REFERENCES pos(id) ON DELETE CASCADE,
  part_id              BIGINT REFERENCES parts(id),
  ordered_qty          INTEGER NOT NULL,
  status               TEXT,
  stage_timeline       TEXT,
  details_before_ship  TEXT,
  extras               JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX idx_polines_po   ON po_lines(po_id);
CREATE INDEX idx_polines_part ON po_lines(part_id);

-- ========== 4) Lots + QR ==========
CREATE TABLE lots (
  id                      BIGSERIAL PRIMARY KEY,
  po_line_id              BIGINT NOT NULL REFERENCES po_lines(id) ON DELETE CASCADE,
  lot_number              TEXT UNIQUE NOT NULL,
  prod_qty                INTEGER NOT NULL,
  qty_shipped             INTEGER DEFAULT 0,
  incoming_stock          INTEGER DEFAULT 0,
  real_shipped_date       DATE,
  tracking_no             TEXT,
  first_article_no        TEXT,
  remark_product_control  TEXT,
  status                  TEXT CHECK (status IN ('in_process','hold','shipped')) DEFAULT 'in_process',
  extras                  JSONB DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_lots_polines  ON lots(po_line_id);
CREATE INDEX idx_lots_tracking ON lots(tracking_no);

-- QR payload/URL per lot (1:1)
CREATE TABLE lot_qr_codes (
  id             BIGSERIAL PRIMARY KEY,
  lot_id         BIGINT NOT NULL UNIQUE REFERENCES lots(id) ON DELETE CASCADE,
  payload        TEXT NOT NULL,          -- e.g. "LOT:L16899-1" or URL/JSON
  format         TEXT CHECK (format IN ('text','url','json')) DEFAULT 'text',
  image_url      TEXT,                   -- optional cached QR image location
  generated_at   TIMESTAMPTZ DEFAULT now(),
  extras         JSONB DEFAULT '{}'::jsonb
);

-- ========== 5) Workflow (Templates & Instances) ==========
CREATE TABLE workflow_templates (
  id              BIGSERIAL PRIMARY KEY,
  name            TEXT,
  customer_id     BIGINT REFERENCES customers(id),
  part_id         BIGINT REFERENCES parts(id),
  version         INTEGER NOT NULL DEFAULT 1,
  effective_from  DATE,
  effective_to    DATE,
  extras          JSONB DEFAULT '{}'::jsonb,
  UNIQUE (part_id, version)
);

CREATE TABLE workflow_step_templates (
  id                        BIGSERIAL PRIMARY KEY,
  workflow_template_id      BIGINT NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
  step_no                   INTEGER NOT NULL,
  step_code                 TEXT,
  step_name                 TEXT,
  station                   TEXT,
  required                  BOOLEAN DEFAULT TRUE,
  expected_duration_minutes INTEGER,
  qa_required               BOOLEAN DEFAULT FALSE,
  qa_template_id            BIGINT,      -- optional link to qa_templates
  extras                    JSONB DEFAULT '{}'::jsonb,
  UNIQUE (workflow_template_id, step_no)
);
CREATE INDEX idx_wst_tpl ON workflow_step_templates(workflow_template_id);

CREATE TABLE workflow_instances (
  id                     BIGSERIAL PRIMARY KEY,
  lot_id                 BIGINT NOT NULL UNIQUE REFERENCES lots(id) ON DELETE CASCADE,
  workflow_template_id   BIGINT NOT NULL REFERENCES workflow_templates(id),
  status                 TEXT CHECK (status IN ('in_progress','completed','hold')) DEFAULT 'in_progress',
  started_at             TIMESTAMPTZ DEFAULT now(),
  completed_at           TIMESTAMPTZ
);
CREATE INDEX idx_wi_tpl ON workflow_instances(workflow_template_id);

CREATE TABLE workflow_step_instances (
  id                       BIGSERIAL PRIMARY KEY,
  workflow_instance_id     BIGINT NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  step_template_id         BIGINT NOT NULL REFERENCES workflow_step_templates(id),
  step_no                  INTEGER NOT NULL,
  status                   TEXT CHECK (status IN ('pending','running','passed','failed')) DEFAULT 'pending',
  started_at               TIMESTAMPTZ,
  completed_at             TIMESTAMPTZ,
  assignee_employee_id     BIGINT REFERENCES employees(id),
  qa_result                TEXT, -- 'pass','fail','n.a.'
  qa_inspection_id         BIGINT,
  notes                    TEXT,
  extras                   JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX idx_wsi_wi ON workflow_step_instances(workflow_instance_id);
CREATE INDEX idx_wsi_assignee ON workflow_step_instances(assignee_employee_id);

-- ========== 6) QA ==========
CREATE TABLE qa_templates (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT UNIQUE,
  aql         TEXT,
  parameters  JSONB,
  extras      JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE qa_inspections (
  id                    BIGSERIAL PRIMARY KEY,
  lot_id                BIGINT REFERENCES lots(id) ON DELETE CASCADE,
  step_instance_id      BIGINT REFERENCES workflow_step_instances(id) ON DELETE SET NULL,
  inspector_employee_id BIGINT REFERENCES employees(id),
  inspected_at          TIMESTAMPTZ DEFAULT now(),
  result                TEXT CHECK (result IN ('pass','fail')),
  remarks               TEXT,
  extras                JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX idx_qai_lot   ON qa_inspections(lot_id);
CREATE INDEX idx_qai_step  ON qa_inspections(step_instance_id);
CREATE INDEX idx_qai_emp   ON qa_inspections(inspector_employee_id);

-- ========== 7) Materials & Inventory ==========
CREATE TABLE materials (
  id            BIGSERIAL PRIMARY KEY,
  material_code TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  spec          TEXT,
  uom_base      TEXT NOT NULL,
  notes         TEXT,
  extras        JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX idx_mat_code ON materials(material_code);

CREATE TABLE material_batches (
  id             BIGSERIAL PRIMARY KEY,
  material_id    BIGINT NOT NULL REFERENCES materials(id),
  batch_no       TEXT,
  supplier       TEXT,
  received_at    DATE NOT NULL,
  location       TEXT,
  cost_per_unit  NUMERIC(12,4),
  uom            TEXT NOT NULL,
  notes          TEXT,
  extras         JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX idx_mat_batches_mat ON material_batches(material_id);

CREATE TABLE inventory_transactions (
  id                 BIGSERIAL PRIMARY KEY,
  material_batch_id  BIGINT NOT NULL REFERENCES material_batches(id),
  txn_type           TEXT NOT NULL CHECK (txn_type IN
    ('RECEIVE','RESERVE','UNRESERVE','ISSUE','RETURN','ADJUST_PLUS','ADJUST_MINUS','SCRAP')),
  qty                NUMERIC(14,4) NOT NULL,
  ref_type           TEXT,
  ref_id             BIGINT,
  note               TEXT,
  created_at         TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_inv_txn_batch ON inventory_transactions(material_batch_id);
CREATE INDEX idx_inv_txn_ref   ON inventory_transactions(ref_type, ref_id);

CREATE TABLE part_boms (
  id            BIGSERIAL PRIMARY KEY,
  part_id       BIGINT NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
  material_id   BIGINT NOT NULL REFERENCES materials(id),
  qty_per_unit  NUMERIC(14,4) NOT NULL,
  uom           TEXT NOT NULL,
  UNIQUE(part_id, material_id)
);

CREATE TABLE lot_material_requirements (
  id            BIGSERIAL PRIMARY KEY,
  lot_id        BIGINT NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
  material_id   BIGINT NOT NULL REFERENCES materials(id),
  qty_required  NUMERIC(14,4) NOT NULL,
  uom           TEXT NOT NULL,
  UNIQUE(lot_id, material_id)
);

CREATE TABLE lot_material_allocations (
  id                BIGSERIAL PRIMARY KEY,
  lot_id            BIGINT NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
  material_batch_id BIGINT NOT NULL REFERENCES material_batches(id),
  qty_reserved      NUMERIC(14,4) DEFAULT 0,
  qty_issued        NUMERIC(14,4) DEFAULT 0,
  qty_returned      NUMERIC(14,4) DEFAULT 0,
  qty_scrap         NUMERIC(14,4) DEFAULT 0,
  notes             TEXT
);
CREATE UNIQUE INDEX ux_lma_lot_batch ON lot_material_allocations(lot_id, material_batch_id);
CREATE INDEX idx_lma_lot   ON lot_material_allocations(lot_id);
CREATE INDEX idx_lma_batch ON lot_material_allocations(material_batch_id);

-- ========== 8) Attachments ==========
CREATE TABLE attachments (
  id           BIGSERIAL PRIMARY KEY,
  entity_type  TEXT NOT NULL,   -- 'po','lot','workflow_instance','qa','part', ...
  entity_id    BIGINT NOT NULL,
  file_name    TEXT,
  file_url     TEXT,
  uploaded_at  TIMESTAMPTZ DEFAULT now(),
  extras       JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX idx_attach_entity ON attachments(entity_type, entity_id);

COMMIT;

-- =========================================================
-- Sample seed data (minimal demo)
-- =========================================================
BEGIN;

INSERT INTO employees (employee_code, first_name, last_name, position, department, email)
VALUES
('EMP001','John','Doe','Operator','Production','john@example.com'),
('EMP002','Amy','Chan','Inspector','QA','amy@example.com');

INSERT INTO customers (customer_code, name, type, phone, email)
VALUES ('AF6182','Topnotch AF6182','company','+1-213-555-0192','contact@af6182.com');

INSERT INTO parts (part_number, description, fair_no)
VALUES ('PN-001','Sample Part Description','11296');

INSERT INTO pos (customer_id, po_number, status, urgent, date_due, start_mfg_date, shop_traveler_ref, fair_long_note, remarks)
VALUES (1,'PO12345','open', TRUE, '2025-08-20','2025-08-10','ST-2025-08-10','Note A','Need 100 pcs, part in stock');

INSERT INTO po_lines (po_id, part_id, ordered_qty, status, stage_timeline, details_before_ship)
VALUES (1,1,500,'open','ST-01','Need 100 pcs, part in stock');

INSERT INTO lots (po_line_id, lot_number, prod_qty, status)
VALUES (1,'L16899-1',500,'in_process');

INSERT INTO lot_qr_codes (lot_id, payload, format)
VALUES (1,'LOT:L16899-1','text');

-- Workflow template + steps
INSERT INTO workflow_templates (name, customer_id, part_id, version, effective_from)
VALUES ('AF6182 - PN-001', 1, 1, 1, '2025-08-10');

INSERT INTO workflow_step_templates (workflow_template_id, step_no, step_code, step_name, station, required, expected_duration_minutes, qa_required)
VALUES
(1,1,'CUT','Cutting','CNC-1',TRUE,60,FALSE),
(1,2,'WELD','Welding','WELD-2',TRUE,90,TRUE),
(1,3,'QA-FINAL','Final QA','QA-1',TRUE,30,TRUE);

-- Instance for lot
INSERT INTO workflow_instances (lot_id, workflow_template_id, status)
VALUES (1,1,'in_progress');

INSERT INTO workflow_step_instances (workflow_instance_id, step_template_id, step_no, status, assignee_employee_id)
VALUES
(1,1,1,'passed',1),
(1,2,2,'pending',1),
(1,3,3,'pending',NULL);

-- QA template + one inspection demo
INSERT INTO qa_templates (name, aql, parameters) VALUES ('AQL 1.0% General-II','1.0%','{"sample_size":80}');

INSERT INTO qa_inspections (lot_id, step_instance_id, inspector_employee_id, result, remarks)
VALUES (1,2,2,'pass','AQL ok');

COMMIT;
