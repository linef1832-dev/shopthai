// ---------- ระบบหลังบ้าน (Admin) ----------
const $ = (s) => document.querySelector(s);
const fmt = (n) => "฿" + Number(n).toLocaleString("th-TH");
const PW_KEY = "shopthai_admin_pw";

const STATUS_LABEL = {
  pending: "รอดำเนินการ", paid: "ชำระแล้ว", shipped: "จัดส่งแล้ว",
  completed: "สำเร็จ", cancelled: "ยกเลิก",
};

function getPw() { return sessionStorage.getItem(PW_KEY) || ""; }
function setPw(pw) { sessionStorage.setItem(PW_KEY, pw); }
function clearPw() { sessionStorage.removeItem(PW_KEY); }

async function api(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", "X-Admin-Password": getPw(), ...(opts.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { logout(); throw new Error("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่"); }
  if (!res.ok) throw new Error(data.error || "เกิดข้อผิดพลาด");
  return data;
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), 2400);
}

function imgHtml(image) {
  const isUrl = /^https?:\/\//.test(image || "");
  return isUrl ? `<img src="${image}" alt="" />` : (image || "📦");
}

// ---------- เข้าสู่ระบบ ----------
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const pw = $("#loginPw").value;
  try {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    if (!res.ok) throw new Error("รหัสผ่านไม่ถูกต้อง");
    setPw(pw);
    showDashboard();
  } catch (err) {
    $("#loginErr").textContent = err.message;
    $("#loginErr").hidden = false;
  }
});

function logout() {
  clearPw();
  $("#dashView").hidden = true;
  $("#loginView").style.display = "grid";
}
$("#logoutBtn").addEventListener("click", logout);

function showDashboard() {
  $("#loginView").style.display = "none";
  $("#dashView").hidden = false;
  loadAll();
}

// ---------- แท็บ ----------
document.querySelectorAll(".tab").forEach((t) =>
  t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    const tab = t.dataset.tab;
    $("#tab-dashboard").hidden = tab !== "dashboard";
    $("#tab-products").hidden = tab !== "products";
    $("#tab-orders").hidden = tab !== "orders";
  }));

// ---------- โหลดข้อมูลทั้งหมด ----------
let productsCache = [];
let ordersCache = [];

async function loadAll() {
  await Promise.all([loadProducts(), loadOrders()]);
  renderStats();
  renderDashboard();
}

function renderDashboard() {
  // ยอดขาย 7 วันล่าสุด
  const now = new Date();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const total = ordersCache
      .filter((o) => o.status !== "cancelled" && (o.createdAt || "").slice(0, 10) === key)
      .reduce((s, o) => s + o.total, 0);
    days.push({ label: d.toLocaleDateString("th-TH", { day: "numeric", month: "short" }), total });
  }
  const max = Math.max(1, ...days.map((d) => d.total));
  $("#salesChart").innerHTML = days.map((d) => `
    <div class="bar-col">
      <div class="bar-val">${d.total ? "฿" + d.total.toLocaleString("th-TH") : ""}</div>
      <div class="bar" style="height:${Math.max(2, Math.round((d.total / max) * 100))}%"></div>
      <div class="bar-label">${d.label}</div>
    </div>`).join("");

  // สถานะคำสั่งซื้อ
  const statuses = ["pending", "paid", "shipped", "completed", "cancelled"];
  const maxS = Math.max(1, ...statuses.map((s) => ordersCache.filter((o) => o.status === s).length));
  $("#statusChart").innerHTML = statuses.map((s) => {
    const c = ordersCache.filter((o) => o.status === s).length;
    return `<div class="sb-row">
      <span class="sb-label">${STATUS_LABEL[s]}</span>
      <div class="sb-track"><div class="sb-fill f-${s}" style="width:${Math.round((c / maxS) * 100)}%"></div></div>
      <span class="sb-count">${c}</span>
    </div>`;
  }).join("");

  // สินค้าใกล้หมด
  const low = productsCache.filter((p) => p.stock <= 5).sort((a, b) => a.stock - b.stock);
  $("#lowStock").innerHTML = low.length
    ? low.map((p) => `<div class="ls-row"><span>${p.name}</span><span class="${p.stock <= 0 ? "ls-out" : "ls-low"}">${p.stock} ชิ้น</span></div>`).join("")
    : `<p class="muted">ไม่มีสินค้าใกล้หมด ทุกอย่างพร้อมขาย 👍</p>`;
}

function renderStats() {
  const revenue = ordersCache.filter((o) => o.status !== "cancelled").reduce((s, o) => s + o.total, 0);
  const pending = ordersCache.filter((o) => o.status === "pending").length;
  $("#stats").innerHTML = `
    <div class="stat-card"><div class="label">สินค้าทั้งหมด</div><div class="value">${productsCache.length}</div></div>
    <div class="stat-card"><div class="label">คำสั่งซื้อ</div><div class="value">${ordersCache.length}</div></div>
    <div class="stat-card"><div class="label">รอดำเนินการ</div><div class="value">${pending}</div></div>
    <div class="stat-card"><div class="label">ยอดขายรวม</div><div class="value">${fmt(revenue)}</div></div>`;
}

// ---------- สินค้า ----------
async function loadProducts() {
  productsCache = await api("/api/products");
  $("#productRows").innerHTML = productsCache.map((p) => `
    <tr>
      <td>
        <div class="prod-cell">
          <div class="thumb">${imgHtml(p.image)}</div>
          <div><strong>${p.name}</strong></div>
        </div>
      </td>
      <td>${p.category || "-"}</td>
      <td>${fmt(p.price)}</td>
      <td class="${p.stock <= 5 ? "stock-low" : ""}">${p.stock}</td>
      <td>
        <div class="row-actions">
          <button class="btn btn-sm" data-edit="${p.id}">แก้ไข</button>
          <button class="btn btn-sm btn-danger" data-del="${p.id}">ลบ</button>
        </div>
      </td>
    </tr>`).join("") || `<tr><td colspan="5" style="text-align:center;color:#64748b;padding:40px">ยังไม่มีสินค้า</td></tr>`;

  $("#productRows").querySelectorAll("[data-edit]").forEach((b) =>
    b.addEventListener("click", () => openProductForm(b.dataset.edit)));
  $("#productRows").querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", () => deleteProduct(b.dataset.del)));
}

function openProductForm(id) {
  const form = $("#productForm");
  form.reset();
  if (id) {
    const p = productsCache.find((x) => x.id === id);
    $("#productModalTitle").textContent = "แก้ไขสินค้า";
    form.id.value = p.id;
    form.name.value = p.name;
    form.description.value = p.description || "";
    form.price.value = p.price;
    form.stock.value = p.stock;
    form.category.value = p.category || "";
    form.image.value = p.image || "";
  } else {
    $("#productModalTitle").textContent = "เพิ่มสินค้า";
    form.id.value = "";
  }
  $("#productModal").hidden = false;
}

$("#newProductBtn").addEventListener("click", () => openProductForm(null));
$("#cancelProduct").addEventListener("click", () => ($("#productModal").hidden = true));

$("#productForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const payload = {
    name: form.name.value.trim(),
    description: form.description.value.trim(),
    price: Number(form.price.value),
    stock: parseInt(form.stock.value) || 0,
    category: form.category.value.trim(),
    image: form.image.value.trim(),
  };
  const id = form.id.value;
  try {
    if (id) await api("/api/products/" + id, { method: "PUT", body: JSON.stringify(payload) });
    else await api("/api/products", { method: "POST", body: JSON.stringify(payload) });
    $("#productModal").hidden = true;
    toast(id ? "บันทึกการแก้ไขแล้ว" : "เพิ่มสินค้าแล้ว");
    await loadProducts();
    renderStats();
  } catch (err) {
    toast(err.message);
  }
});

async function deleteProduct(id) {
  const p = productsCache.find((x) => x.id === id);
  if (!confirm(`ต้องการลบสินค้า "${p?.name}" ใช่หรือไม่?`)) return;
  try {
    await api("/api/products/" + id, { method: "DELETE" });
    toast("ลบสินค้าแล้ว");
    await loadProducts();
    renderStats();
  } catch (err) {
    toast(err.message);
  }
}

// ---------- คำสั่งซื้อ ----------
async function loadOrders() {
  ordersCache = await api("/api/orders");
  if (!ordersCache.length) {
    $("#orderList").innerHTML = `<div class="empty-box">ยังไม่มีคำสั่งซื้อ</div>`;
    return;
  }
  $("#orderList").innerHTML = ordersCache.map((o) => {
    const date = new Date(o.createdAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
    const opts = Object.entries(STATUS_LABEL)
      .map(([k, v]) => `<option value="${k}" ${o.status === k ? "selected" : ""}>${v}</option>`).join("");
    return `
      <div class="order-card">
        <div class="order-top">
          <div>
            <div class="order-id">#${o.id}</div>
            <div class="order-date">${date}</div>
          </div>
          <span class="badge-status s-${o.status}">${STATUS_LABEL[o.status] || o.status}</span>
        </div>
        <div class="order-cust">
          <strong>${o.customer.name}</strong> · ${o.customer.phone}<br />
          ${o.customer.address}${o.customer.note ? `<br /><em>หมายเหตุ: ${o.customer.note}</em>` : ""}
        </div>
        <div class="order-items">
          ${o.items.map((it) => `<div class="it"><span>${it.name} × ${it.qty}</span><span>${fmt(it.price * it.qty)}</span></div>`).join("")}
        </div>
        <div class="order-foot">
          <span class="order-total">รวม ${fmt(o.total)}</span>
          <select class="status-select" data-order="${o.id}">${opts}</select>
        </div>
      </div>`;
  }).join("");

  $("#orderList").querySelectorAll("[data-order]").forEach((sel) =>
    sel.addEventListener("change", () => updateOrderStatus(sel.dataset.order, sel.value)));
}

async function updateOrderStatus(id, status) {
  try {
    await api("/api/orders/" + id, { method: "PUT", body: JSON.stringify({ status }) });
    toast("อัปเดตสถานะแล้ว");
    await loadOrders();
    renderStats();
  } catch (err) {
    toast(err.message);
  }
}

// ---------- เริ่มต้น: ถ้ามีรหัสผ่านในเซสชันอยู่แล้ว ลองเข้าเลย ----------
if (getPw()) {
  api("/api/orders").then(showDashboard).catch(() => logout());
}
