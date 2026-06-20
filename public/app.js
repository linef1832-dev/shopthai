// ---------- หน้าร้าน (Storefront) ----------
const $ = (s) => document.querySelector(s);
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

// ----- ตะกร้า (เก็บใน localStorage) -----
const getCart = () => { try { return JSON.parse(localStorage.getItem("cart") || "[]"); } catch { return []; } };
const setCart = (c) => { localStorage.setItem("cart", JSON.stringify(c)); renderCart(); };

function imgHtml(image, cls = "") {
  const isUrl = /^https?:\/\//.test(image || "");
  return isUrl ? `<img class="${cls}" src="${image}" alt="" />` : (image || "📦");
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
  $("#categories").querySelectorAll(".chip").forEach((b) =>
    b.addEventListener("click", () => { activeCat = b.dataset.cat; renderCategories(); renderProducts(); }));
}

function renderProducts() {
  const list = products.filter((p) => {
    const okCat = activeCat === "ทั้งหมด" || p.category === activeCat;
    const okTerm = !term || p.name.toLowerCase().includes(term) || (p.description || "").toLowerCase().includes(term);
    return okCat && okTerm;
  });
  $("#empty").hidden = list.length > 0;
  $("#productGrid").innerHTML = list.map((p) => `
    <article class="card">
      <div class="card-img">${imgHtml(p.image)}</div>
      <div class="card-body">
        <span class="card-cat">${p.category || ""}</span>
        <h3 class="card-name">${p.name}</h3>
        <p class="card-desc">${p.description || ""}</p>
        <div class="card-foot">
          <span class="price">${fmt(p.price)}</span>
          ${p.stock > 0
            ? `<button class="btn btn-primary btn-sm" data-add="${p.id}">เพิ่มลงตะกร้า</button>`
            : `<span class="stock-out">สินค้าหมด</span>`}
        </div>
      </div>
    </article>`).join("");
  $("#productGrid").querySelectorAll("[data-add]").forEach((b) =>
    b.addEventListener("click", () => addToCart(b.dataset.add)));
}

// ----- จัดการตะกร้า -----
function addToCart(id) {
  const product = products.find((p) => p.id === id);
  if (!product) return;
  const cart = getCart();
  const item = cart.find((i) => i.id === id);
  const cur = item ? item.qty : 0;
  if (cur + 1 > product.stock) return toast("สินค้ามีไม่เพียงพอ");
  if (item) item.qty += 1; else cart.push({ id, qty: 1 });
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
  const count = detailed.reduce((s, i) => s + i.qty, 0);
  $("#cartCount").textContent = count;
  const total = detailed.reduce((s, i) => s + i.product.price * i.qty, 0);
  $("#cartTotal").textContent = fmt(total);
  $("#checkoutBtn").disabled = detailed.length === 0;

  $("#cartItems").innerHTML = detailed.length
    ? detailed.map((i) => `
      <div class="cart-row">
        <div class="thumb">${imgHtml(i.product.image, "")}</div>
        <div class="info">
          <div class="n">${i.product.name}</div>
          <div class="p">${fmt(i.product.price)}</div>
        </div>
        <div class="qty">
          <button data-dec="${i.id}">−</button>
          <span>${i.qty}</span>
          <button data-inc="${i.id}">+</button>
        </div>
      </div>`).join("")
    : `<p class="cart-empty">ตะกร้ายังว่างอยู่</p>`;

  $("#cartItems").querySelectorAll("[data-inc]").forEach((b) => b.addEventListener("click", () => changeQty(b.dataset.inc, 1)));
  $("#cartItems").querySelectorAll("[data-dec]").forEach((b) => b.addEventListener("click", () => changeQty(b.dataset.dec, -1)));
}

// ----- เปิด/ปิด UI -----
const openCart = () => { $("#cartDrawer").hidden = false; $("#cartOverlay").hidden = false; };
const closeCart = () => { $("#cartDrawer").hidden = true; $("#cartOverlay").hidden = true; };
const openCheckout = () => { $("#checkoutModal").hidden = false; };
const closeCheckout = () => { $("#checkoutModal").hidden = true; };

// ----- Event bindings -----
$("#cartBtn").addEventListener("click", openCart);
$("#closeCart").addEventListener("click", closeCart);
$("#cartOverlay").addEventListener("click", closeCart);
$("#search").addEventListener("input", (e) => { term = e.target.value.trim().toLowerCase(); renderProducts(); });
$("#checkoutBtn").addEventListener("click", () => { if (getCart().length) openCheckout(); });
$("#cancelCheckout").addEventListener("click", closeCheckout);

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
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setCart([]);
    e.target.reset();
    closeCheckout();
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
