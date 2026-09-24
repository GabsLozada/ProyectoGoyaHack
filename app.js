/* ===== AuraCafé — shared data layer =====
   Orders live in localStorage so index.html (cliente) and runner.html
   (runner) can "talk" to each other across tabs without a backend. */

const STORAGE_KEY = 'auracafe_orders';
const RUNNER_STATS_KEY = 'auracafe_runner_stats';

function getOrders() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch (e) { return []; }
}
function saveOrders(orders) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
  // Fire a manual event so the SAME tab can react too (storage event
  // only fires in OTHER tabs by spec).
  window.dispatchEvent(new CustomEvent('orders-changed'));
}
function addOrder(order) {
  const orders = getOrders();
  orders.unshift(order);
  saveOrders(orders);
  return order;
}
function updateOrder(id, patch) {
  const orders = getOrders();
  const idx = orders.findIndex(o => o.id === id);
  if (idx > -1) { orders[idx] = { ...orders[idx], ...patch }; saveOrders(orders); }
  return orders[idx];
}

function getRunnerStats() {
  try { return JSON.parse(localStorage.getItem(RUNNER_STATS_KEY)) || { earnings: 0, deliveries: 0 }; }
  catch (e) { return { earnings: 0, deliveries: 0 }; }
}
function saveRunnerStats(stats) {
  localStorage.setItem(RUNNER_STATS_KEY, JSON.stringify(stats));
}

function uid() { return 'ord_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7); }

function timeAgoLabel(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'justo ahora';
  if (mins === 1) return 'hace 1 min';
  return `hace ${mins} min`;
}

/* ===== Toasts ===== */
function toast(msg, icon = '✅') {
  let stack = document.querySelector('.toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
  stack.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .2s, transform .2s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(-8px)';
    setTimeout(() => el.remove(), 200);
  }, 2600);
}

/* =======================================================
   CLIENTE (index.html) — solo se ejecuta si existe #productList
   ======================================================= */
const PRODUCTS = [
  { id: 'americano', name: 'Café Americano', emoji: '☕', desc: 'Calientito, directo de la cafetería.', price: 25, source: 'Cafetería Ingeniería' },
  { id: 'chilaquiles', name: 'Chilaquiles Express', emoji: '🌶️', desc: 'Para sobrevivir al entre-clases.', price: 45, source: 'Cafetería Los Pumitas' },
  { id: 'energetica', name: 'Bebida Energética', emoji: '⚡', desc: 'Para el examen final.', price: 35, source: 'OXXO Anexo' },
  { id: 'panditas', name: 'Combo Panditas + Agua', emoji: '🍬', desc: 'Antojo rápido y dulce.', price: 30, source: 'OXXO Anexo' },
];

const LOCATIONS = ['Edificio Q · Q-103', 'Anexo A · A-202', 'Bloque C · C-310', 'Biblioteca central'];

if (document.getElementById('productList')) {
  const cart = {}; // id -> qty

  const productList = document.getElementById('productList');
  const cartBar = document.getElementById('cartBar');
  const cartCount = document.getElementById('cartCount');
  const cartTotal = document.getElementById('cartTotal');
  const overlay = document.getElementById('overlay');
  const sheet = document.getElementById('sheet');
  const sheetSummary = document.getElementById('sheetSummary');
  const chipRow = document.getElementById('chipRow');
  const locInput = document.getElementById('locInput');
  const confirmBtn = document.getElementById('confirmBtn');
  const menuView = document.getElementById('menuView');
  const trackingView = document.getElementById('trackingView');

  let selectedLocation = '';

  function renderProducts() {
    productList.innerHTML = PRODUCTS.map(p => {
      const qty = cart[p.id] || 0;
      return `
        <div class="product-card">
          <div class="product-emoji">${p.emoji}</div>
          <div class="product-info">
            <h3>${p.name}</h3>
            <p>${p.desc}</p>
            <span class="product-price">$${p.price.toFixed(2)} MXN</span>
          </div>
          ${qty === 0
            ? `<button class="add-btn" data-add="${p.id}">Agregar</button>`
            : `<div class="stepper">
                 <button data-dec="${p.id}">−</button>
                 <span class="qty">${qty}</span>
                 <button data-inc="${p.id}">+</button>
               </div>`
          }
        </div>`;
    }).join('');
  }

  function updateCartBar() {
    const items = Object.values(cart).reduce((a, b) => a + b, 0);
    const total = PRODUCTS.reduce((sum, p) => sum + (cart[p.id] || 0) * p.price, 0);
    cartCount.textContent = items;
    cartTotal.textContent = `$${total.toFixed(2)} MXN`;
    cartBar.classList.toggle('visible', items > 0);
  }

  productList.addEventListener('click', (e) => {
    const add = e.target.dataset.add, inc = e.target.dataset.inc, dec = e.target.dataset.dec;
    if (add) {
      cart[add] = 1;
      e.target.classList.add('added');
      e.target.textContent = 'Agregado ✓';
      setTimeout(() => { renderProducts(); }, 350);
    } else if (inc) {
      cart[inc] = (cart[inc] || 0) + 1;
      renderProducts();
    } else if (dec) {
      cart[dec] = Math.max(0, (cart[dec] || 0) - 1);
      if (cart[dec] === 0) delete cart[dec];
      renderProducts();
    }
    updateCartBar();
  });

  chipRow.innerHTML = LOCATIONS.map(l => `<button class="chip" data-loc="${l}">${l}</button>`).join('');
  chipRow.addEventListener('click', (e) => {
    const loc = e.target.dataset.loc;
    if (!loc) return;
    selectedLocation = loc;
    locInput.value = loc;
    [...chipRow.children].forEach(c => c.classList.toggle('active', c.dataset.loc === loc));
    confirmBtn.disabled = false;
  });
  locInput.addEventListener('input', () => {
    selectedLocation = locInput.value.trim();
    [...chipRow.children].forEach(c => c.classList.remove('active'));
    confirmBtn.disabled = selectedLocation.length === 0;
  });

  function openSheet() {
    const lines = PRODUCTS.filter(p => cart[p.id]).map(p =>
      `<div class="summary-row"><span>${cart[p.id]}× ${p.name}</span><span>$${(cart[p.id]*p.price).toFixed(2)}</span></div>`
    ).join('');
    const total = PRODUCTS.reduce((sum, p) => sum + (cart[p.id] || 0) * p.price, 0);
    sheetSummary.innerHTML = lines + `<div class="summary-row total"><span>Total</span><span>$${total.toFixed(2)} MXN</span></div>`;
    confirmBtn.disabled = selectedLocation.length === 0;
    overlay.classList.add('visible');
    sheet.classList.add('visible');
  }
  function closeSheet() {
    overlay.classList.remove('visible');
    sheet.classList.remove('visible');
  }
  document.getElementById('cartBarCta').addEventListener('click', openSheet);
  overlay.addEventListener('click', closeSheet);

  confirmBtn.addEventListener('click', () => {
    if (!selectedLocation) return;
    const items = PRODUCTS.filter(p => cart[p.id]).map(p => ({ id: p.id, name: p.name, emoji: p.emoji, qty: cart[p.id], price: p.price, source: p.source }));
    const total = items.reduce((s, i) => s + i.qty * i.price, 0);
    const order = {
      id: uid(),
      items,
      total,
      location: selectedLocation,
      status: 'buscando', // buscando -> en_camino -> entregado
      createdAt: Date.now(),
      runnerName: null,
    };
    addOrder(order);
    localStorage.setItem('auracafe_active_order', order.id);
    closeSheet();
    toast('¡Pedido enviado! Buscando runner…', '🚀');
    showTracking(order.id);
  });

  function renderTimeline(order) {
    const steps = [
      { key: 'buscando', title: 'Pedido confirmado', sub: 'Pollar aseguró tu pago al instante.' },
      { key: 'en_camino', title: 'Runner en camino', sub: order.runnerName ? `${order.runnerName} va para allá.` : 'Un runner tomará tu pedido pronto.' },
      { key: 'entregado', title: 'Entregado en tu salón', sub: 'Pago liquidado automáticamente en Stellar.' },
    ];
    const order_map = { buscando: 0, en_camino: 1, entregado: 2 };
    const current = order_map[order.status];
    return steps.map((s, i) => {
      const cls = i < current ? 'done' : i === current ? 'active' : '';
      const icon = i < current ? '✓' : (i === 0 ? '📝' : i === 1 ? '🏃' : '🎉');
      return `
        <div class="tl-step ${cls}">
          ${i < steps.length - 1 ? '<div class="tl-line"></div>' : ''}
          <div class="tl-dot">${icon}</div>
          <div class="tl-text">
            <div class="tl-title">${s.title}</div>
            <div class="tl-sub">${s.sub}</div>
          </div>
        </div>`;
    }).join('');
  }

  function showTracking(orderId) {
    const order = getOrders().find(o => o.id === orderId);
    if (!order) { menuView.style.display = ''; trackingView.style.display = 'none'; return; }
    menuView.style.display = 'none';
    trackingView.style.display = '';
    cartBar.classList.remove('visible');
    trackingView.innerHTML = `
      <div class="tracking-card">
        <span class="eyebrow">Pedido ${order.id.slice(-5).toUpperCase()} · ${order.location}</span>
        <h2>${order.items.map(i => `${i.qty}× ${i.name}`).join(', ')}</h2>
        <div class="timeline">${renderTimeline(order)}</div>
      </div>
      ${order.status === 'entregado' ? '<button class="new-order-btn" id="newOrderBtn">Hacer otro pedido</button>' : ''}
    `;
    const btn = document.getElementById('newOrderBtn');
    if (btn) btn.addEventListener('click', () => {
      localStorage.removeItem('auracafe_active_order');
      Object.keys(cart).forEach(k => delete cart[k]);
      renderProducts(); updateCartBar();
      menuView.style.display = ''; trackingView.style.display = 'none';
    });
  }

  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      const activeId = localStorage.getItem('auracafe_active_order');
      if (activeId) {
        const order = getOrders().find(o => o.id === activeId);
        if (order && order.status === 'en_camino' && trackingView.dataset.lastStatus !== 'en_camino') {
          toast(`${order.runnerName || 'Un runner'} va en camino 🏃`, '🏃');
        }
        if (order && order.status === 'entregado' && trackingView.dataset.lastStatus !== 'entregado') {
          toast('¡Tu pedido llegó! Buen provecho 🎉', '🎉');
        }
        if (order) trackingView.dataset.lastStatus = order.status;
        showTracking(activeId);
      }
    }
  });
  window.addEventListener('orders-changed', () => {
    const activeId = localStorage.getItem('auracafe_active_order');
    if (activeId) showTracking(activeId);
  });

  renderProducts();
  updateCartBar();
  const existingActive = localStorage.getItem('auracafe_active_order');
  if (existingActive && getOrders().some(o => o.id === existingActive && o.status !== 'entregado')) {
    showTracking(existingActive);
  }
}
