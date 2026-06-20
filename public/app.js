// ---------- หน้าร้าน (Storefront) ----------
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const fmt = (n) => "฿" + Number(n).toLocaleString("th-TH");

async function api(url, opts) {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "เกิดข้อผิดพลาด");
  return data;
}

let products = [];
let activeCat = "ทั้งหมด";
let term = "";
let sortBy = "new";
let detailId = null;
let detailQty = 1;

const STATUS_LABEL = {
  pending: "⏳ รอดำเนินการ", paid: "💰 ชำระแล้ว", shipped: "🚚 จัดส่งแล้ว",
  completed: "✅ สำเร็จ", cancelled: "❌ ยกเลิก",
};

// ----- ธีม (โหมดมืด) -----
function applyTheme(t) {
  document.body.classList.toggle("dark", t === "dark");
  $("#themeBtn").textContent = t === "dark" ? "☀️" : "🌙";
  localStorage.setItem("theme", t);
}
$("#themeBtn").addEventListener("click", () =>
  applyTheme(document.body.classList.contains("dark") ? "light" : "dark"));
applyTheme(localStorage.getItem("theme") || "light");

// ----- ตะกร้า -----
const getCart = () => { try { return JSON.parse(localStorage.getItem("cart") || "[]"); } catch { return []; } };
const setCart = (c) => { localStorage.setItem("cart", JSON.stringify(c)); renderCart(); };

function imgHtml(image) {
  const isUrl = /^https?:\/\//.test(image || "");
  return isUrl ? `<img src="${image}" alt="" />` : `<span class="emoji">${image || "📦"}</span>`;
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), 2200);
}

// ----- โหลด & แสดงสินค้า -----
async function loadProducts() {
  try {
    products = await api("/api/products");
    renderCategories();
    renderProducts();
  } catch (e) {
    $("#productGrid").innerHTML = `<p class="empty">โหลดสินค้าไม่สำเร็จ: ${e.message}</p>`;
  }
}

function renderCategories() {
  const cats = ["ทั้งหมด", ...new Set(products.map((p) => p.category).filter(Boolean))];
  $("#categories").innerHTML = cats
    .map((c) => `<button class="chip ${c === activeCat ? "active" : ""}" data-cat="${c}">${c}</button>`)
    .join("");
  $$("#categories .chip").forEach((b) =>
    b.addEventListener("click", () => { activeCat = b.dataset.cat; renderCategories(); renderProducts(); }));
}

function sortList(list) {
  const l = [...list];
  if (sortBy === "price-asc") l.sort((a, b) => a.price - b.price);
  else if (sortBy === "price-desc") l.sort((a, b) => b.price - a.price);
  else if (sortBy === "name") l.sort((a, b) => a.name.localeCompare(b.name, "th"));
  return l;
}

function renderProducts() {
  let list = products.filter((p) => {
    const okCat = activeCat === "ทั้งหมด" || p.category === activeCat;
    const okTerm = !term || p.name.toLowerCase().includes(term) || (p.description || "").toLowerCase().includes(term);
    return okCat && okTerm;
  });
  list = sortList(list);
  $("#empty").hidden = list.length > 0;
  $("#productGrid").innerHTML = list.map((p) => `
    <article class="card" data-detail="${p.id}">
      <div class="card-img">${imgHtml(p.image)}${p.stock <= 0 ? '<span class="ribbon">หมด</span>' : (p.stock <= 5 ? '<span class="ribbon low">ใกล้หมด</span>' : '')}</div>
      <div class="card-body">
        <span class="card-cat">${p.category || ""}</span>
        <h3 class="card-name">${p.name}</h3>
        <p class="card-desc">${p.description || ""}</p>
        <div class="card-foot">
          <span class="price">${fmt(p.price)}</span>
          ${p.stock > 0
            ? `<button class="btn btn-primary btn-sm" data-add="${p.id}">เพิ่ม 🛒</button>`
            : `<span class="stock-out">สินค้าหมด</span>`}
        </div>
      </div>
    </article>`).join("");
  $$("#productGrid [data-add]").forEach((b) =>
    b.addEventListener("click", (e) => { e.stopPropagation(); addToCart(b.dataset.add); }));
  $$("#productGrid [data-detail]").forEach((c) =>
    c.addEventListener("click", () => openDetail(c.dataset.detail)));
}

// ----- รายละเอียดสินค้า -----
function openDetail(id) {
  const p = products.find((x) => x.id === id);
  if (!p) return;
  detailId = id; detailQty = 1;
  $("#detailImg").innerHTML = imgHtml(p.image);
  $("#detailCat").textContent = p.category || "";
  $("#detailName").textContent = p.name;
  $("#detailDesc").textContent = p.description || "ไม่มีรายละเอียดเพิ่มเติม";
  $("#detailPrice").textContent = fmt(p.price);
  $("#detailStock").textContent = p.stock > 0 ? `คงเหลือ ${p.stock} ชิ้น` : "สินค้าหมด";
  $("#detailQty").textContent = detailQty;
  $("#detailAdd").disabled = p.stock <= 0;
  $("#detailModal").hidden = false;
}
function detailChange(d) {
  const p = products.find((x) => x.id === detailId);
  if (!p) return;
  detailQty = Math.min(Math.max(1, detailQty + d), Math.max(1, p.stock));
  $("#detailQty").textContent = detailQty;
}
$("#detailMinus").addEventListener("click", () => detailChange(-1));
$("#detailPlus").addEventListener("click", () => detailChange(1));
$("#closeDetail").addEventListener("click", () => ($("#detailModal").hidden = true));
$("#detailAdd").addEventListener("click", () => {
  addToCart(detailId, detailQty);
  $("#detailModal").hidden = true;
});

// ----- จัดการตะกร้า -----
function addToCart(id, qty = 1) {
  const product = products.find((p) => p.id === id);
  if (!product) return;
  const cart = getCart();
  const item = cart.find((i) => i.id === id);
  const cur = item ? item.qty : 0;
  if (cur + qty > product.stock) return toast("สินค้ามีไม่เพียงพอ");
  if (item) item.qty += qty; else cart.push({ id, qty });
  setCart(cart);
  toast("เพิ่มลงตะกร้าแล้ว ✓");
}
function changeQty(id, delta) {
  const cart = getCart();
  const item = cart.find((i) => i.id === id);
  if (!item) return;
  const product = products.find((p) => p.id === id);
  item.qty += delta;
  if (product && item.qty > product.stock) { item.qty = product.stock; toast("ถึงจำนวนสูงสุดแล้ว"); }
  setCart(item.qty <= 0 ? cart.filter((i) => i.id !== id) : cart);
}
function renderCart() {
  const cart = getCart();
  const detailed = cart.map((i) => ({ ...i, product: products.find((p) => p.id === i.id) })).filter((i) => i.product);
  $("#cartCount").textContent = detailed.reduce((s, i) => s + i.qty, 0);
  const total = detailed.reduce((s, i) => s + i.product.price * i.qty, 0);
  $("#cartTotal").textContent = fmt(total);
  $("#checkoutBtn").disabled = detailed.length === 0;
  $("#cartItems").innerHTML = detailed.length
    ? detailed.map((i) => `
      <div class="cart-row">
        <div class="thumb">${imgHtml(i.product.image)}</div>
        <div class="info"><div class="n">${i.product.name}</div><div class="p">${fmt(i.product.price)}</div></div>
        <div class="qty">
          <button data-dec="${i.id}">−</button><span>${i.qty}</span><button data-inc="${i.id}">+</button>
        </div>
      </div>`).join("")
    : `<p class="cart-empty">ตะกร้ายังว่างอยู่</p>`;
  $$("#cartItems [data-inc]").forEach((b) => b.addEventListener("click", () => changeQty(b.dataset.inc, 1)));
  $$("#cartItems [data-dec]").forEach((b) => b.addEventListener("click", () => changeQty(b.dataset.dec, -1)));
}

// ----- เปิด/ปิด UI -----
const openCart = () => { $("#cartDrawer").hidden = false; $("#cartOverlay").hidden = false; };
const closeCart = () => { $("#cartDrawer").hidden = true; $("#cartOverlay").hidden = true; };

$("#cartBtn").addEventListener("click", openCart);
$("#closeCart").addEventListener("click", closeCart);
$("#cartOverlay").addEventListener("click", closeCart);
$("#search").addEventListener("input", (e) => { term = e.target.value.trim().toLowerCase(); renderProducts(); });
$("#sort").addEventListener("change", (e) => { sortBy = e.target.value; renderProducts(); });
$("#checkoutBtn").addEventListener("click", () => { if (getCart().length) $("#checkoutModal").hidden = false; });
$("#cancelCheckout").addEventListener("click", () => ($("#checkoutModal").hidden = true));

// เมนูนำทาง + ลิงก์เปิดป๊อปอัป
$$("[data-go]").forEach((a) => a.addEventListener("click", (e) => {
  e.preventDefault();
  const target = a.dataset.go === "home" ? "#home" : "#products";
  document.querySelector(target)?.scrollIntoView({ behavior: "smooth" });
  $$(".menu-link").forEach((m) => m.classList.toggle("active", m.dataset.go === a.dataset.go));
}));
$$("[data-open]").forEach((a) => a.addEventListener("click", (e) => {
  e.preventDefault();
  $("#" + a.dataset.open + "Modal").hidden = false;
}));
$("#closeTrack").addEventListener("click", () => ($("#trackModal").hidden = true));
$("#closeAbout").addEventListener("click", () => ($("#aboutModal").hidden = true));

// ----- เช็คสถานะออเดอร์ -----
$("#trackForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const oid = new FormData(e.target).get("oid").trim();
  const box = $("#trackResult");
  box.innerHTML = `<p class="muted-text">กำลังค้นหา…</p>`;
  try {
    const o = await api("/api/orders/" + encodeURIComponent(oid));
    const date = new Date(o.createdAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
    box.innerHTML = `
      <div class="track-card">
        <div class="track-top">
          <span class="track-id">#${o.id}</span>
          <span class="badge-status s-${o.status}">${STATUS_LABEL[o.status] || o.status}</span>
        </div>
        <div class="muted-text">ลูกค้า: ${o.customerName || "-"} · ${date}</div>
        <div class="track-items">
          ${o.items.map((it) => `<div class="it"><span>${it.name} × ${it.qty}</span><span>${fmt(it.price * it.qty)}</span></div>`).join("")}
        </div>
        <div class="track-total">รวม ${fmt(o.total)}</div>
      </div>`;
  } catch (err) {
    box.innerHTML = `<p class="track-err">${err.message}</p>`;
  }
});

// ----- ยืนยันสั่งซื้อ -----
$("#checkoutForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const cart = getCart();
  if (!cart.length) return;
  const fd = new FormData(e.target);
  const payload = {
    customer: { name: fd.get("name"), phone: fd.get("phone"), address: fd.get("address"), note: fd.get("note") },
    items: cart.map((i) => ({ id: i.id, qty: i.qty })),
  };
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    const order = await api("/api/orders", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    setCart([]);
    e.target.reset();
    $("#checkoutModal").hidden = true;
    closeCart();
    toast("สั่งซื้อสำเร็จ! เลขที่ " + order.id);
    loadProducts();
  } catch (err) {
    toast(err.message);
  } finally {
    btn.disabled = false;
  }
});

// เริ่มต้น
loadProducts();
renderCart();
