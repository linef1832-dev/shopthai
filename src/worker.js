/**
 * ShopThai — Backend บน Cloudflare Workers + D1
 *
 * - เสิร์ฟหน้าเว็บผ่าน Static Assets (env.ASSETS)
 * - REST API ที่ /api/*
 * - ฐานข้อมูล D1 (env.DB) สร้างตาราง + ใส่สินค้าตัวอย่างอัตโนมัติเมื่อเรียกครั้งแรก
 */

const SEED = [
  { name: "เสื้อยืดคอตตอน 100%", description: "เสื้อยืดผ้าคอตตอนเนื้อนุ่ม ใส่สบาย ระบายอากาศดี", price: 299, category: "เสื้อผ้า", image: "👕", stock: 50 },
  { name: "กางเกงยีนส์ทรงสลิม", description: "ยีนส์เนื้อดี ทรงสวย ใส่ได้ทุกโอกาส", price: 590, category: "เสื้อผ้า", image: "👖", stock: 30 },
  { name: "รองเท้าผ้าใบ", description: "รองเท้าผ้าใบน้ำหนักเบา พื้นนุ่ม เดินสบายทั้งวัน", price: 1290, category: "รองเท้า", image: "👟", stock: 20 },
  { name: "หมวกแก๊ป", description: "หมวกแก๊ปปรับขนาดได้ กันแดดได้ดี", price: 250, category: "แอคเซสเซอรี่", image: "🧢", stock: 40 },
  { name: "กระเป๋าเป้", description: "กระเป๋าเป้จุของได้เยอะ มีช่องใส่โน้ตบุ๊ก", price: 890, category: "กระเป๋า", image: "🎒", stock: 15 },
  { name: "แว่นกันแดด", description: "แว่นกันแดดเลนส์ป้องกัน UV400", price: 450, category: "แอคเซสเซอรี่", image: "🕶️", stock: 25 },
  { name: "นาฬิกาข้อมือ", description: "นาฬิกาดีไซน์มินิมอล กันน้ำ สายหนังแท้", price: 1990, category: "แอคเซสเซอรี่", image: "⌚", stock: 10 },
  { name: "เสื้อแจ็คเก็ต", description: "แจ็คเก็ตกันลม ใส่ได้ทุกฤดู", price: 1290, category: "เสื้อผ้า", image: "🧥", stock: 18 },
];

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

const genId = (prefix) => prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 12);

// สร้าง schema + seed (ทำครั้งเดียวต่อ isolate)
let initPromise = null;
function ensureInit(db) {
  if (!initPromise) {
    initPromise = doInit(db).catch((e) => {
      initPromise = null; // ให้ลองใหม่ครั้งหน้าถ้าพลาด
      throw e;
    });
  }
  return initPromise;
}
async function doInit(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
      price REAL NOT NULL, category TEXT, image TEXT, stock INTEGER NOT NULL DEFAULT 0)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY, created_at TEXT, customer TEXT, items TEXT,
      total REAL, status TEXT)`),
  ]);
  const row = await db.prepare("SELECT COUNT(*) AS c FROM products").first();
  if (row && row.c === 0) {
    const stmt = db.prepare(
      "INSERT INTO products (id,name,description,price,category,image,stock) VALUES (?,?,?,?,?,?,?)"
    );
    await db.batch(
      SEED.map((p) => stmt.bind(genId("p_"), p.name, p.description, p.price, p.category, p.image, p.stock))
    );
  }
}

const orderRow = (r) => ({
  id: r.id,
  createdAt: r.created_at,
  customer: JSON.parse(r.customer),
  items: JSON.parse(r.items),
  total: r.total,
  status: r.status,
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ทุกอย่างที่ไม่ใช่ /api ส่งให้ Static Assets จัดการ (หน้าเว็บ)
    if (!path.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    try {
      await ensureInit(env.DB);
      return await handleApi(request, env, path);
    } catch (e) {
      return json({ error: "เกิดข้อผิดพลาดในระบบ: " + (e?.message || e) }, 500);
    }
  },
};

async function handleApi(request, env, path) {
  const method = request.method;
  const db = env.DB;
  const adminPw = env.ADMIN_PASSWORD || "admin123";
  const isAdmin = () => request.headers.get("X-Admin-Password") === adminPw;
  const body = async () => {
    try { return await request.json(); } catch { return {}; }
  };

  const parts = path.split("/").filter(Boolean); // ['api','products','<id>']
  const resource = parts[1];
  const id = parts[2];

  // ---- เข้าสู่ระบบแอดมิน ----
  if (path === "/api/admin/login" && method === "POST") {
    const b = await body();
    if (b.password === adminPw) return json({ ok: true });
    return json({ error: "รหัสผ่านไม่ถูกต้อง" }, 401);
  }

  // ---- สินค้า ----
  if (resource === "products") {
    if (method === "GET" && !id) {
      const { results } = await db.prepare("SELECT * FROM products ORDER BY rowid DESC").all();
      return json(results);
    }
    if (method === "GET" && id) {
      const p = await db.prepare("SELECT * FROM products WHERE id=?").bind(id).first();
      return p ? json(p) : json({ error: "ไม่พบสินค้า" }, 404);
    }
    // ต่อจากนี้ต้องเป็นแอดมิน
    if (!isAdmin()) return json({ error: "ไม่ได้รับอนุญาต กรุณาเข้าสู่ระบบ" }, 401);

    if (method === "POST") {
      const b = await body();
      if (!b.name || b.price == null) return json({ error: "กรุณาระบุชื่อสินค้าและราคา" }, 400);
      const pid = genId("p_");
      await db.prepare(
        "INSERT INTO products (id,name,description,price,category,image,stock) VALUES (?,?,?,?,?,?,?)"
      ).bind(pid, b.name, b.description || "", Number(b.price), b.category || "ทั่วไป", b.image || "📦", parseInt(b.stock) || 0).run();
      const p = await db.prepare("SELECT * FROM products WHERE id=?").bind(pid).first();
      return json(p, 201);
    }
    if (method === "PUT" && id) {
      const cur = await db.prepare("SELECT * FROM products WHERE id=?").bind(id).first();
      if (!cur) return json({ error: "ไม่พบสินค้า" }, 404);
      const b = await body();
      const merged = {
        name: b.name ?? cur.name,
        description: b.description ?? cur.description,
        price: b.price != null ? Number(b.price) : cur.price,
        category: b.category ?? cur.category,
        image: b.image ?? cur.image,
        stock: b.stock != null ? parseInt(b.stock) : cur.stock,
      };
      await db.prepare(
        "UPDATE products SET name=?,description=?,price=?,category=?,image=?,stock=? WHERE id=?"
      ).bind(merged.name, merged.description, merged.price, merged.category, merged.image, merged.stock, id).run();
      const p = await db.prepare("SELECT * FROM products WHERE id=?").bind(id).first();
      return json(p);
    }
    if (method === "DELETE" && id) {
      const cur = await db.prepare("SELECT id FROM products WHERE id=?").bind(id).first();
      if (!cur) return json({ error: "ไม่พบสินค้า" }, 404);
      await db.prepare("DELETE FROM products WHERE id=?").bind(id).run();
      return json({ ok: true });
    }
  }

  // ---- คำสั่งซื้อ ----
  if (resource === "orders") {
    if (method === "POST") {
      const b = await body();
      const customer = b.customer || {};
      const items = b.items || [];
      if (!customer.name || !customer.phone || !customer.address)
        return json({ error: "กรุณากรอกข้อมูลผู้รับให้ครบถ้วน" }, 400);
      if (!Array.isArray(items) || items.length === 0)
        return json({ error: "ตะกร้าสินค้าว่างเปล่า" }, 400);

      const orderItems = [];
      for (const it of items) {
        const p = await db.prepare("SELECT * FROM products WHERE id=?").bind(it.id).first();
        if (!p) return json({ error: "ไม่พบสินค้าบางรายการในระบบ" }, 400);
        const qty = Math.max(1, parseInt(it.qty) || 1);
        if (p.stock < qty) return json({ error: `สินค้า "${p.name}" มีไม่เพียงพอ` }, 400);
        orderItems.push({ id: p.id, name: p.name, price: p.price, qty });
      }
      // ตัดสต็อก
      await db.batch(
        orderItems.map((it) =>
          db.prepare("UPDATE products SET stock = stock - ? WHERE id=?").bind(it.qty, it.id))
      );
      const total = orderItems.reduce((s, it) => s + it.price * it.qty, 0);
      const oid = genId("o_");
      const created = new Date().toISOString();
      const cust = { name: customer.name, phone: customer.phone, address: customer.address, note: customer.note || "" };
      await db.prepare(
        "INSERT INTO orders (id,created_at,customer,items,total,status) VALUES (?,?,?,?,?,?)"
      ).bind(oid, created, JSON.stringify(cust), JSON.stringify(orderItems), total, "pending").run();
      return json({ id: oid, createdAt: created, customer: cust, items: orderItems, total, status: "pending" }, 201);
    }

    // ติดตามสถานะออเดอร์ (สาธารณะ) ด้วยเลขที่ออเดอร์ — ไม่คืนข้อมูลส่วนตัวเต็ม
    if (method === "GET" && id) {
      const r = await db.prepare("SELECT * FROM orders WHERE id=?").bind(id).first();
      if (!r) return json({ error: "ไม่พบคำสั่งซื้อนี้ ตรวจสอบเลขที่ออเดอร์อีกครั้ง" }, 404);
      const o = orderRow(r);
      return json({
        id: o.id, createdAt: o.createdAt, items: o.items,
        total: o.total, status: o.status, customerName: o.customer?.name || "",
      });
    }

    // ต่อจากนี้ต้องเป็นแอดมิน
    if (!isAdmin()) return json({ error: "ไม่ได้รับอนุญาต กรุณาเข้าสู่ระบบ" }, 401);

    if (method === "GET") {
      const { results } = await db.prepare("SELECT * FROM orders ORDER BY created_at DESC").all();
      return json(results.map(orderRow));
    }
    if (method === "PUT" && id) {
      const cur = await db.prepare("SELECT * FROM orders WHERE id=?").bind(id).first();
      if (!cur) return json({ error: "ไม่พบคำสั่งซื้อ" }, 404);
      const b = await body();
      const allowed = ["pending", "paid", "shipped", "completed", "cancelled"];
      if (allowed.includes(b.status)) {
        await db.prepare("UPDATE orders SET status=? WHERE id=?").bind(b.status, id).run();
      }
      const r = await db.prepare("SELECT * FROM orders WHERE id=?").bind(id).first();
      return json(orderRow(r));
    }
  }

  return json({ error: "ไม่พบเส้นทาง API" }, 404);
}
