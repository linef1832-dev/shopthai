-- โครงสร้างฐานข้อมูล D1 สำหรับ ShopThai
-- (Worker จะสร้างตารางและใส่สินค้าตัวอย่างให้อัตโนมัติอยู่แล้ว
--  ไฟล์นี้มีไว้สำหรับสร้าง/รีเซ็ตด้วยมือผ่าน wrangler ถ้าต้องการ)

CREATE TABLE IF NOT EXISTS products (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  price       REAL NOT NULL,
  category    TEXT,
  image       TEXT,
  stock       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  id         TEXT PRIMARY KEY,
  created_at TEXT,
  customer   TEXT,   -- JSON: {name, phone, address, note}
  items      TEXT,   -- JSON: [{id, name, price, qty}]
  total      REAL,
  status     TEXT    -- pending | paid | shipped | completed | cancelled
);
