-- =========================================================
-- Topnotch MFG – Initial Schema (PostgreSQL)
-- =========================================================
BEGIN;

-- ========== 1) Customers & Contacts ==========
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

-- (optional, รองรับหลายที่อยู่/กำหนด default)
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
-- default อย่างมาก 1 รายการ/ประเภท ต่อ 1 ลูกค้า
CREATE UNIQUE INDEX ux_caddr_default_billing
  ON customer_addresses(customer_id) WHERE is_default_billing = TRUE;
CREATE UNIQUE INDEX ux_caddr_default_shipping
  ON customer_addresses(customer_id) WHERE is_default_shipping = TRUE;

-- (optional, ผู้ติดต่อหลายคน/กำหนด primary)
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

-- ========== 3) Customer PO ==========
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

-- ========== 4) Production Lots ==========
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

-- ========== 5) Workflow (Shop Traveler) ==========
-- Templates (แบบแผน)
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
  id                     BIGSERIAL PRIMARY KEY,
  workflow_template_id   BIGINT NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
  step_no                INTEGER NOT NULL,
  step_code              TEXT,
  step_name              TEXT,
  station                TEXT,
  required               BOOLEAN DEFAULT TRUE,
  expected_duration_minutes INTEGER,
  qa_required            BOOLEAN DEFAULT FALSE,
  qa_template_id         BIGINT,  -- link ไป qa_templates (optional, ผูกทีหลังได้)
  extras                 JSONB DEFAULT '{}'::jsonb,
  UNIQUE (workflow_template_id, step_no)
);
CREATE INDEX idx_wst_tpl ON workflow_step_templates(workflow_template_id);

-- Instances (ของจริงต่อ Lot)
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
  assignee                 TEXT,
  qa_result                TEXT, -- 'pass','fail','n.a.' (ไม่บังคับ strict)
  qa_inspection_id         BIGINT, -- จะถูกอ้างจาก qa_inspections หลัง insert
  notes                    TEXT,
  extras                   JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX idx_wsi_wi ON workflow_step_instances(workflow_instance_id);

-- ========== 6) QA ==========
CREATE TABLE qa_templates (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT UNIQUE,
  aql         TEXT,
  parameters  JSONB,
  extras      JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE qa_inspections (
  id               BIGSERIAL PRIMARY KEY,
  lot_id           BIGINT REFERENCES lots(id) ON DELETE CASCADE,
  step_instance_id BIGINT REFERENCES workflow_step_instances(id) ON DELETE SET NULL,
  inspector_name   TEXT,
  inspected_at     TIMESTAMPTZ DEFAULT now(),
  result           TEXT CHECK (result IN ('pass','fail')),
  remarks          TEXT,
  extras           JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX idx_qai_lot  ON qa_inspections(lot_id);
CREATE INDEX idx_qai_step ON qa_inspections(step_instance_id);

-- (เชื่อมกลับ: อัปเดตภายหลังด้วยแอป/trigger ก็ได้)
-- ALTER TABLE workflow_step_instances
--   ADD CONSTRAINT fk_wsi_qai FOREIGN KEY (qa_inspection_id) REFERENCES qa_inspections(id);

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
  ref_type           TEXT,      -- 'LOT','PO','QA', ...
  ref_id             BIGINT,    -- id ของเอกสารอ้างอิง
  note               TEXT,
  created_at         TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_inv_txn_batch ON inventory_transactions(material_batch_id);
CREATE INDEX idx_inv_txn_ref   ON inventory_transactions(ref_type, ref_id);

-- BOM ต่อ Part (ถ้ามี)
CREATE TABLE part_boms (
  id            BIGSERIAL PRIMARY KEY,
  part_id       BIGINT NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
  material_id   BIGINT NOT NULL REFERENCES materials(id),
  qty_per_unit  NUMERIC(14,4) NOT NULL,
  uom           TEXT NOT NULL,
  UNIQUE(part_id, material_id)
);

-- ความต้องการวัตถุดิบของ Lot (แผน)
CREATE TABLE lot_material_requirements (
  id            BIGSERIAL PRIMARY KEY,
  lot_id        BIGINT NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
  material_id   BIGINT NOT NULL REFERENCES materials(id),
  qty_required  NUMERIC(14,4) NOT NULL,
  uom           TEXT NOT NULL,
  UNIQUE(lot_id, material_id)
);

-- การจัดสรรแบทช์ให้ Lot (จอง/เบิก/คืน/สแครป)
CREATE TABLE lot_material_allocations (
  id               BIGSERIAL PRIMARY KEY,
  lot_id           BIGINT NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
  material_batch_id BIGINT NOT NULL REFERENCES material_batches(id),
  qty_reserved     NUMERIC(14,4) DEFAULT 0,
  qty_issued       NUMERIC(14,4) DEFAULT 0,
  qty_returned     NUMERIC(14,4) DEFAULT 0,
  qty_scrap        NUMERIC(14,4) DEFAULT 0,
  notes            TEXT
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
