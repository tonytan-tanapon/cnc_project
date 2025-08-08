BEGIN;

-- ตารางลูกค้า
CREATE TABLE customers (
    customer_id SERIAL PRIMARY KEY,
    customer_code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    contact_name VARCHAR(255),
    contact_phone VARCHAR(50),
    contact_email VARCHAR(255),
    address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ตารางพนักงาน
CREATE TABLE employees (
    employee_id SERIAL PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    position VARCHAR(100),
    department VARCHAR(100),
    phone_number VARCHAR(20),
    email VARCHAR(255) UNIQUE,
    hire_date DATE,
    status VARCHAR(50) DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ตาราง Raw Materials
CREATE TABLE raw_materials (
    raw_material_id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    unit VARCHAR(50) NOT NULL,
    quantity DECIMAL(12,2) DEFAULT 0,
    unit_price DECIMAL(12,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ตาราง PO
CREATE TABLE purchase_orders (
    po_id SERIAL PRIMARY KEY,
    po_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id INT NOT NULL REFERENCES customers(customer_id),
    po_date DATE NOT NULL,
    due_date DATE,
    status VARCHAR(50) DEFAULT 'Open',
    remarks TEXT
);

-- ตาราง Lot
CREATE TABLE lots (
    lot_id SERIAL PRIMARY KEY,
    lot_number VARCHAR(50) UNIQUE NOT NULL,
    po_id INT NOT NULL REFERENCES purchase_orders(po_id),
    raw_material_id INT REFERENCES raw_materials(raw_material_id),
    prod_qty INT CHECK (prod_qty > 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ตาราง QR ของ Lot
CREATE TABLE lot_qr_codes (
    qr_id SERIAL PRIMARY KEY,
    lot_id INT UNIQUE NOT NULL REFERENCES lots(lot_id) ON DELETE CASCADE,
    payload TEXT NOT NULL,         -- ข้อความ/URL สำหรับ encode
    format VARCHAR(20) DEFAULT 'PNG',
    image_url TEXT,                 -- ถ้าจะเก็บ path หรือ URL ของไฟล์
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ตาราง QA Inspection
CREATE TABLE qa_inspections (
    inspection_id SERIAL PRIMARY KEY,
    lot_id INT NOT NULL REFERENCES lots(lot_id),
    inspector_employee_id INT REFERENCES employees(employee_id),
    result VARCHAR(50), -- Pass / Fail
    remarks TEXT,
    inspected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ตาราง Tracking Process
CREATE TABLE process_tracking (
    tracking_id SERIAL PRIMARY KEY,
    lot_id INT NOT NULL REFERENCES lots(lot_id),
    step_name VARCHAR(255) NOT NULL,
    assignee_employee_id INT REFERENCES employees(employee_id),
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    status VARCHAR(50) DEFAULT 'Pending'
);

COMMIT;
