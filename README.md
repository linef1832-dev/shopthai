# 🛍️ ShopThai — ร้านค้าออนไลน์ + ระบบหลังบ้าน (Cloudflare)

ร้านค้าออนไลน์พร้อมระบบจัดการหลังบ้าน รันบน **Cloudflare Workers** + ฐานข้อมูล **D1**

- **หน้าร้าน** (`/`) — แสดงสินค้า, ค้นหา, ตะกร้า, สั่งซื้อ
- **หน้าหลังบ้าน** (`/admin.html`) — เข้าสู่ระบบ, จัดการสินค้า (เพิ่ม/แก้ไข/ลบ), ดูคำสั่งซื้อ + เปลี่ยนสถานะ, สรุปยอดขาย
- **Backend** — REST API บน Worker, ข้อมูลเก็บใน D1 (Worker สร้างตาราง + ใส่สินค้าตัวอย่างให้อัตโนมัติ)

## โครงสร้างโปรเจกต์
```
├─ src/worker.js      # Backend (REST API + D1)
├─ public/            # หน้าเว็บ (storefront + admin)
│  ├─ index.html / style.css / app.js
│  └─ admin.html / admin.css / admin.js
├─ wrangler.jsonc     # ค่าตั้งค่า Cloudflare
├─ schema.sql         # โครงสร้าง DB (สำรอง)
└─ package.json
```

---

## วิธี Deploy ขึ้น Cloudflare

> ต้องมี **บัญชี Cloudflare** (สมัครฟรีที่ https://dash.cloudflare.com/sign-up)

### วิธี A — เชื่อม Git กับ Dashboard (ไม่ต้องลง Node บนเครื่อง) ✅ แนะนำ

1. push โค้ดนี้ขึ้น GitHub (หรือ GitLab)
2. ไปที่ Cloudflare Dashboard → **Storage & Databases → D1** → **Create database**
   - ตั้งชื่อ `shopthai-db` → คัดลอก **Database ID** มาวางใน `wrangler.jsonc` ช่อง `database_id`
   - commit + push การแก้ไขนี้
3. ไปที่ **Workers & Pages → Create → Workers → Import a repository**
   - เลือก repo นี้ แล้วกด Deploy (Cloudflare จะรัน `npm install` + `wrangler deploy` ให้เองในคลาวด์)
4. เปิด URL ที่ได้ เช่น `https://shopthai.<subdomain>.workers.dev`

### วิธี B — Deploy จากเครื่องด้วย Wrangler CLI

ต้องติดตั้ง [Node.js](https://nodejs.org) ก่อน จากนั้น:

```bash
npm install                          # ติดตั้ง wrangler
npx wrangler login                   # ล็อกอิน Cloudflare (เปิดเบราว์เซอร์)
npx wrangler d1 create shopthai-db   # สร้าง DB แล้วนำ database_id ไปใส่ใน wrangler.jsonc
npx wrangler deploy                  # deploy
```

ทดสอบบนเครื่อง: `npx wrangler dev` แล้วเปิด http://localhost:8787

---

## ⚙️ ตั้งค่าที่ควรรู้

| สิ่ง | ค่าเริ่มต้น | เปลี่ยนที่ |
|------|-----------|-----------|
| รหัสผ่านแอดมิน | `admin123` | `wrangler.jsonc` → `vars.ADMIN_PASSWORD` |
| ชื่อ Worker | `shopthai` | `wrangler.jsonc` → `name` |
| ชื่อ D1 | `shopthai-db` | `wrangler.jsonc` → `database_name` |

> **ความปลอดภัย:** ก่อนใช้งานจริง เปลี่ยนรหัสผ่านแอดมิน และแนะนำตั้งเป็น Secret แทน vars:
> ```bash
> npx wrangler secret put ADMIN_PASSWORD
> ```

## API หลัก
| Method | Path | คำอธิบาย | ต้องเป็นแอดมิน |
|--------|------|----------|:--:|
| GET | `/api/products` | รายการสินค้า | |
| POST | `/api/products` | เพิ่มสินค้า | ✓ |
| PUT/DELETE | `/api/products/:id` | แก้ไข/ลบ | ✓ |
| POST | `/api/orders` | สั่งซื้อ | |
| GET | `/api/orders` | ดูคำสั่งซื้อ | ✓ |
| PUT | `/api/orders/:id` | เปลี่ยนสถานะ | ✓ |
| POST | `/api/admin/login` | เข้าสู่ระบบ | |
