/* Aura — front conectado al backend (Node + Express + Stellar).
   Cuentas, pedidos, códigos y estados viven en el servidor.
   localStorage solo guarda la sesión (quién eres). */

/* ================= API ================= */
// Si abres con Live Server (puerto 5500) o como archivo, apunta al backend local.
const API_BASE = window.AURA_API_BASE
  || ((location.protocol === 'file:' || ['5500', '5501', '5173'].includes(location.port))
    ? 'http://localhost:3000/api'
    : '/api');

async function api(path, body, method) {
  let r;
  try {
    r = await fetch(API_BASE + path, body !== undefined || method
      ? { method: method || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }
      : undefined);
  } catch (_) {
    throw new Error('No hay conexión con el servidor. ¿Está corriendo el backend?');
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
  return data;
}

let CONFIG = null;
async function getConfig() {
  if (!CONFIG) CONFIG = await api('/config');
  return CONFIG;
}

/* ================= Sesión ================= */
const USER_KEY = 'aura_user';
// Limpia los datos del prototipo viejo (causaban el pedido "atorado" y el código perdido)
['auracafe_orders', 'auracafe_active_order', 'aura_accounts', 'auracafe_runner_stats']
  .forEach(k => localStorage.removeItem(k));

function getUser() {
  try {
    const u = JSON.parse(localStorage.getItem(USER_KEY));
    return u && u.id ? u : null; // sesiones del prototipo viejo (sin id) ya no sirven
  } catch (_) { return null; }
}
function setUser(u) { localStorage.setItem(USER_KEY, JSON.stringify(u)); }
function requireUser() {
  const user = getUser();
  if (!user) { goTo('auth.html?mode=login'); return null; }
  return user;
}

/* ================= UI helpers ================= */
requestAnimationFrame(() => document.body.classList.add('loaded'));
window.addEventListener('pageshow', (e) => { if (e.persisted) document.body.classList.add('loaded'); });

function goTo(url) {
  document.body.classList.remove('loaded');
  setTimeout(() => { window.location.href = url; }, 180);
}

if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
  const glow = document.createElement('div');
  glow.className = 'cursor-glow';
  document.body.appendChild(glow);
  let raf = null, mx = 0, my = 0;
  window.addEventListener('mousemove', (e) => {
    mx = e.clientX; my = e.clientY;
    glow.classList.add('active');
    if (!raf) raf = requestAnimationFrame(() => {
      glow.style.transform = `translate(${mx}px, ${my}px) translate(-50%, -50%)`;
      raf = null;
    });
  });
  document.addEventListener('mouseleave', () => glow.classList.remove('active'));
}

function firstName(name = '') { return (String(name).trim().split(/\s+/)[0] || 'ahí'); }
function escapeHTML(v = '') {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}
function formatMoney(n) { return `$${Number(n || 0).toFixed(2)} MXN`; }
function itemsLine(o) { return o.items.map(i => `${i.qty}× ${escapeHTML(i.name)}`).join(', '); }
function shortId(o) { return `#${String(o.id).padStart(4, '0')}`; }
function timeAgoLabel(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (!isFinite(mins) || mins < 1) return 'justo ahora';
  return mins === 1 ? 'hace 1 min' : `hace ${mins} min`;
}
function toast(msg, icon = '✓') {
  let stack = document.querySelector('.toast-stack');
  if (!stack) { stack = document.createElement('div'); stack.className = 'toast-stack'; document.body.appendChild(stack); }
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${icon}</span><span>${escapeHTML(msg)}</span>`;
  stack.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(-8px)'; setTimeout(() => el.remove(), 220); }, 2800);
}
function txLink(hash, label) {
  if (!hash) return '';
  if (String(hash).startsWith('SIM-')) return `<small class="tx-note">${label}: simulado (modo demo)</small>`;
  const net = CONFIG && CONFIG.network === 'public' ? 'public' : 'testnet';
  return `<a class="tx-note" target="_blank" rel="noopener" href="https://stellar.expert/explorer/${net}/tx/${hash}">${label}: ver en Stellar ↗</a>`;
}
// Repite fn cada ms mientras la pestaña esté visible
function poll(fn, ms) {
  fn();
  setInterval(() => { if (!document.hidden) fn(); }, ms);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) fn(); });
}

/* Estados del backend → cómo se ven en la UI */
const ACTIVE = ['PENDING_PAYMENT', 'PAID', 'ACCEPTED', 'PICKED_UP', 'SETTLING', 'REFUNDING'];
const STATUS = {
  PENDING_PAYMENT: ['Esperando pago', 'waiting'],
  PAID: ['Buscando Runner', 'waiting'],
  ACCEPTED: ['Runner asignado', 'moving'],
  PICKED_UP: ['Runner en camino', 'moving'],
  SETTLING: ['Liquidando pago', 'moving'],
  DELIVERED: ['Entregado', 'done'],
  REFUNDING: ['Reembolsando', 'waiting'],
  REFUNDED: ['Reembolsado', 'done'],
  CANCELLED: ['Cancelado', 'done'],
};
const statusLabel = s => (STATUS[s] || [s])[0];
const statusClass = s => (STATUS[s] || [, ''])[1];

/* ================= Pago ================= */
// 1) Modo demo (SIMULATE_PAYMENTS=true): se marca pagado solo.
// 2) Con Pollar: pollar.js define window.pagarConPollar(order) → txHash.
// 3) Sin Pollar todavía: el tracking muestra un campo para pegar el txHash.
async function payOrder(order) {
  const cfg = await getConfig();
  if (cfg.simulate) return api(`/orders/${order.id}/pay`, {});
  if (typeof window.pagarConPollar === 'function') {
    const txHash = await window.pagarConPollar(order);
    return api(`/orders/${order.id}/pay`, { txHash });
  }
  return null; // queda en PENDING_PAYMENT
}

/* ================= LANDING ================= */
const accountLinks = document.querySelectorAll('[data-account-link]');
if (accountLinks.length && getUser()) {
  accountLinks.forEach(a => { a.textContent = 'Mi cuenta'; a.href = 'dashboard.html'; });
}

/* ================= AUTH ================= */
if (document.body.classList.contains('auth-page')) {
  if (getUser()) goTo('dashboard.html');
  const tabs = [...document.querySelectorAll('.auth-tab')];
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const title = document.getElementById('authTitle');
  const lead = document.getElementById('authLead');

  function setMode(mode) {
    const isRegister = mode === 'register';
    loginForm.hidden = isRegister;
    registerForm.hidden = !isRegister;
    tabs.forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
    title.textContent = isRegister ? 'Crea tu cuenta' : 'Bienvenido de vuelta';
    lead.textContent = isRegister ? 'Regístrate con el correo que prefieras.' : 'Entra a tu cuenta para continuar.';
    const url = new URL(window.location.href);
    url.searchParams.set('mode', mode);
    history.replaceState(null, '', url);
  }
  tabs.forEach(tab => tab.addEventListener('click', () => setMode(tab.dataset.mode)));
  setMode(new URLSearchParams(location.search).get('mode') === 'register' ? 'register' : 'login');

  async function submit(form, errorId, path, body) {
    const error = document.getElementById(errorId);
    const btn = form.querySelector('button[type=submit]');
    error.textContent = '';
    btn.disabled = true;
    try {
      setUser(await api(path, body));
      goTo('dashboard.html');
    } catch (e) {
      error.textContent = e.message;
    } finally {
      btn.disabled = false;
    }
  }
  registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    submit(registerForm, 'registerError', '/auth/register', {
      name: document.getElementById('regName').value,
      email: document.getElementById('regEmail').value,
      password: document.getElementById('regPass').value,
    });
  });
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    submit(loginForm, 'loginError', '/auth/login', {
      email: document.getElementById('logEmail').value,
      password: document.getElementById('logPass').value,
    });
  });
}

/* ================= NAV con sesión (dashboard / pedido / runner) ================= */
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) logoutBtn.addEventListener('click', () => { localStorage.removeItem(USER_KEY); goTo('index.html'); });
const navUser = document.getElementById('navUser');
if (navUser && getUser()) navUser.textContent = getUser().email;

/* ================= DASHBOARD ================= */
if (document.body.classList.contains('dashboard-page')) {
  const user = requireUser();
  if (user) {
    document.getElementById('welcomeName').textContent = `Hola, ${firstName(user.name)} 👋`;
    const activeBox = document.getElementById('dashboardActiveOrder');
    const activeStatus = document.getElementById('activeStatus');

    async function renderDashboard() {
      let data;
      try { data = await api(`/users/${user.id}/orders`); }
      catch (e) { activeBox.innerHTML = `<div class="empty-inline">${escapeHTML(e.message)}</div>`; return; }

      const active = data.asBuyer.filter(o => ACTIVE.includes(o.status));
      activeStatus.textContent = active.length ? `${active.length} en curso` : '';
      activeBox.innerHTML = active.length ? active.map(o => `
        <article class="active-order-card" style="margin-bottom:12px">
          <div class="active-order-main">
            <span class="status-pill ${statusClass(o.status)}">${statusLabel(o.status)}</span>
            <h3>${itemsLine(o)}</h3>
            <p>${escapeHTML(o.deliverTo)} · ${formatMoney(o.pricing.totalMxn)}${o.runnerName ? ` · Runner: ${escapeHTML(firstName(o.runnerName))}` : ''}</p>
          </div>
          <div class="delivery-code-box compact">
            <small>CÓDIGO DE ENTREGA</small>
            <strong>${escapeHTML(o.deliveryCode)}</strong>
            <span>Dáselo al Runner cuando tengas tu pedido.</span>
          </div>
          <a href="pedido.html?id=${o.id}" class="inline-cta">Ver seguimiento →</a>
        </article>`).join('')
        : `<div class="empty-state"><div>☕</div><h3>No tienes un pedido activo</h3><p>Cuando hagas uno, aquí verás su estado y tu código de entrega.</p><a class="inline-cta" href="pedido.html">Hacer un pedido →</a></div>`;

      const history = data.asBuyer.filter(o => !ACTIVE.includes(o.status));
      document.getElementById('historyCount').textContent = `${history.length} pedido${history.length === 1 ? '' : 's'}`;
      document.getElementById('orderHistory').innerHTML = history.length ? history.map(o => `
        <article class="history-row">
          <div><strong>${itemsLine(o)}</strong><span>${escapeHTML(o.deliverTo)} · ${statusLabel(o.status)}</span></div>
          <div><strong>${formatMoney(o.pricing.totalMxn)}</strong><span>${timeAgoLabel(o.times.deliveredAt || o.times.createdAt)}</span></div>
        </article>`).join('') : `<div class="empty-inline">Todavía no hay pedidos en tu historial.</div>`;
    }
    poll(renderDashboard, 4000);
  }
}

/* ================= PEDIDO ================= */
const LOCATIONS = ['Edificio Q · Q-103', 'Anexo A · A-202', 'Bloque C · C-310', 'Biblioteca central'];

if (document.getElementById('productList')) {
  const user = requireUser();
  if (user) {
    const params = new URLSearchParams(location.search);
    const trackingId = params.get('id');

    const menuView = document.getElementById('menuView');
    const trackingView = document.getElementById('trackingView');
    const cartBar = document.getElementById('cartBar');

    if (trackingId) startTracking(Number(trackingId));
    else startMenu();

    /* ---------- Menú y carrito ---------- */
    async function startMenu() {
      const productList = document.getElementById('productList');
      const cartCount = document.getElementById('cartCount');
      const cartTotal = document.getElementById('cartTotal');
      const overlay = document.getElementById('overlay');
      const sheet = document.getElementById('sheet');
      const sheetSummary = document.getElementById('sheetSummary');
      const chipRow = document.getElementById('chipRow');
      const locInput = document.getElementById('locInput');
      const confirmBtn = document.getElementById('confirmBtn');
      const menuCount = document.getElementById('menuCount');

      let products = [];
      const cart = {};
      let selectedLocation = '';

      try {
        const [menu, cfg] = await Promise.all([api('/menu'), getConfig()]);
        products = Object.values(menu).flat();
        const note = document.getElementById('paymentNote');
        if (note) note.textContent = cfg.simulate
          ? 'Modo demo: el pago se simula y se libera al Runner con tu código.'
          : 'Pagas a una cuenta de custodia en Stellar; se libera al Runner con tu código.';
      } catch (e) {
        productList.innerHTML = `<div class="empty-inline">${escapeHTML(e.message)}</div>`;
        return;
      }
      if (menuCount) menuCount.textContent = `${products.length} opciones`;

      const cartVendor = () => { const id = Object.keys(cart)[0]; return id ? products.find(p => p.id == id).vendor : null; };
      const subtotal = () => products.reduce((s, p) => s + (cart[p.id] || 0) * p.priceMxn, 0);

      function renderProducts() {
        const vendor = cartVendor();
        productList.innerHTML = products.map(p => {
          const qty = cart[p.id] || 0;
          const locked = vendor && vendor !== p.vendor;
          return `<div class="product-card" style="${locked ? 'opacity:.45' : ''}">
            <div class="product-emoji">${escapeHTML(p.emoji)}</div>
            <div class="product-info"><h3>${escapeHTML(p.name)}</h3><p>${escapeHTML(p.description || '')} · ${escapeHTML(p.vendor)}</p><span class="product-price">${formatMoney(p.priceMxn)}</span></div>
            ${qty === 0
              ? `<button class="add-btn" data-add="${p.id}">Agregar</button>`
              : `<div class="stepper"><button data-dec="${p.id}">−</button><span class="qty">${qty}</span><button data-inc="${p.id}">+</button></div>`}
          </div>`;
        }).join('');
      }
      function updateCartBar() {
        const items = Object.values(cart).reduce((a, b) => a + b, 0);
        cartCount.textContent = items;
        cartTotal.textContent = formatMoney(subtotal());
        cartBar.classList.toggle('visible', items > 0);
      }
      productList.addEventListener('click', (e) => {
        const { add, inc, dec } = e.target.dataset;
        if (add) {
          const p = products.find(x => x.id == add);
          const vendor = cartVendor();
          if (vendor && vendor !== p.vendor) {
            toast(`Tu pedido es de ${vendor}. Un pedido = un solo local.`, '!');
            return;
          }
          cart[add] = 1;
        }
        if (inc) cart[inc] = Math.min(5, (cart[inc] || 0) + 1);
        if (dec) { cart[dec] = (cart[dec] || 0) - 1; if (cart[dec] <= 0) delete cart[dec]; }
        renderProducts();
        updateCartBar();
      });

      chipRow.innerHTML = LOCATIONS.map(l => `<button class="chip" data-loc="${escapeHTML(l)}">${escapeHTML(l)}</button>`).join('');
      chipRow.addEventListener('click', (e) => {
        if (!e.target.dataset.loc) return;
        selectedLocation = e.target.dataset.loc;
        locInput.value = selectedLocation;
        [...chipRow.children].forEach(c => c.classList.toggle('active', c.dataset.loc === selectedLocation));
        confirmBtn.disabled = false;
      });
      locInput.addEventListener('input', () => {
        selectedLocation = locInput.value.trim();
        [...chipRow.children].forEach(c => c.classList.remove('active'));
        confirmBtn.disabled = !selectedLocation;
      });

      function openSheet() {
        const lines = products.filter(p => cart[p.id]).map(p =>
          `<div class="summary-row"><span>${cart[p.id]}× ${escapeHTML(p.name)}</span><span>${formatMoney(cart[p.id] * p.priceMxn)}</span></div>`).join('');
        const sub = subtotal();
        const total = sub + CONFIG.deliveryFeeMxn + CONFIG.platformFeeMxn;
        sheetSummary.innerHTML = lines
          + `<div class="summary-row"><span>Envío (para el Runner)</span><span>${formatMoney(CONFIG.deliveryFeeMxn)}</span></div>`
          + `<div class="summary-row"><span>Servicio</span><span>${formatMoney(CONFIG.platformFeeMxn)}</span></div>`
          + `<div class="summary-row total"><span>Total</span><span>${formatMoney(total)}</span></div>`;
        overlay.classList.add('visible');
        sheet.classList.add('visible');
        confirmBtn.disabled = !selectedLocation;
      }
      const closeSheet = () => { overlay.classList.remove('visible'); sheet.classList.remove('visible'); };
      document.getElementById('cartBarCta').addEventListener('click', openSheet);
      overlay.addEventListener('click', closeSheet);

      confirmBtn.addEventListener('click', async () => {
        if (!selectedLocation) return;
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Creando pedido…';
        try {
          const order = await api('/orders', {
            buyerId: user.id,
            deliverTo: selectedLocation,
            items: Object.entries(cart).map(([menuItemId, qty]) => ({ menuItemId: Number(menuItemId), qty })),
          });
          confirmBtn.textContent = 'Procesando pago…';
          try { await payOrder(order); }
          catch (e) { toast(`Pago pendiente: ${e.message}`, '!'); }
          toast(`Pedido enviado. Tu código es ${order.deliveryCode}`, '🔐');
          goTo(`pedido.html?id=${order.id}`);
        } catch (e) {
          toast(e.message, '!');
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'Confirmar pedido';
        }
      });

      renderProducts();
      updateCartBar();
    }

    /* ---------- Seguimiento ---------- */
    function renderTimeline(o) {
      const current = ({ PENDING_PAYMENT: 0, PAID: 0, ACCEPTED: 1, PICKED_UP: 1, SETTLING: 1, DELIVERED: 2 })[o.status] ?? 0;
      const steps = [
        { title: o.status === 'PENDING_PAYMENT' ? 'Esperando pago' : 'Pedido pagado', sub: o.status === 'PENDING_PAYMENT' ? 'Completa el pago para publicarlo.' : 'Tu pago está en custodia y el pedido ya lo ven los Runners.' },
        { title: 'Runner en camino', sub: o.runnerName ? `${escapeHTML(firstName(o.runnerName))} tomó tu pedido.` : 'En cuanto alguien lo acepte, lo verás aquí.' },
        { title: 'Entregado', sub: 'El Runner confirma con tu código y se le libera el pago.' },
      ];
      return steps.map((s, i) => `
        <div class="tl-step ${i < current || o.status === 'DELIVERED' ? 'done' : i === current ? 'active' : ''}">
          ${i < steps.length - 1 ? '<div class="tl-line"></div>' : ''}
          <div class="tl-dot">${i < current || o.status === 'DELIVERED' ? '✓' : ['📝', '🏃', '🎉'][i]}</div>
          <div class="tl-text"><div class="tl-title">${s.title}</div><div class="tl-sub">${s.sub}</div></div>
        </div>`).join('');
    }

    function startTracking(id) {
      menuView.style.display = 'none';
      trackingView.style.display = '';
      cartBar.classList.remove('visible');
      let lastKey = '';

      async function refresh() {
        let o;
        try {
          await getConfig();
          const data = await api(`/users/${user.id}/orders`);
          o = data.asBuyer.find(x => x.id === id);
        } catch (e) { trackingView.innerHTML = `<div class="empty-inline">${escapeHTML(e.message)}</div>`; return; }
        if (!o) { trackingView.innerHTML = `<div class="empty-inline">No encontramos ese pedido en tu cuenta. <a class="inline-cta" href="pedido.html">Hacer un pedido →</a></div>`; return; }

        const key = `${o.status}|${o.runnerId}|${o.payment.payoutTx}`;
        if (key === lastKey) return; // no redibujar si no cambió (no borra lo que escribes)
        lastKey = key;

        const moveClass = o.status === 'DELIVERED' ? 'arrived' : 'moving';
        const canCancel = ['PENDING_PAYMENT', 'PAID'].includes(o.status);
        const needsManualPay = o.status === 'PENDING_PAYMENT' && !CONFIG.simulate;

        trackingView.innerHTML = `
          <div class="tracking-card">
            <span class="eyebrow">PEDIDO ${shortId(o)} · ${escapeHTML(o.vendor)}</span>
            <h2>${itemsLine(o)}</h2>
            <p class="tracking-destination">${escapeHTML(o.deliverTo)} · ${formatMoney(o.pricing.totalMxn)}</p>

            ${o.status === 'DELIVERED' || o.status === 'CANCELLED' || o.status === 'REFUNDED' ? '' : `
            <div class="delivery-code-box">
              <small>TU CÓDIGO DE ENTREGA</small>
              <strong>${escapeHTML(o.deliveryCode)}</strong>
              <span>No lo compartas hasta tener el pedido contigo.</span>
            </div>`}

            ${needsManualPay ? `
            <div class="code-confirm">
              <label for="txHashInput">Paga ${escapeHTML(o.pricing.totalAsset)} ${escapeHTML(o.pricing.asset)} a la custodia con el memo <b>${escapeHTML(o.payment.memo)}</b> y pega el hash</label>
              <div><input id="txHashInput" placeholder="txHash" style="letter-spacing:0;text-align:left"><button id="txHashBtn">Confirmar pago</button></div>
              <small>Custodia: ${escapeHTML(o.payment.escrowAddress)}</small>
              <div class="form-error" id="txHashError"></div>
            </div>` : ''}

            <div class="tracking-motion ${moveClass}">
              <div class="tracking-motion-line"></div>
              <div class="tracking-point start">☕</div>
              <div class="tracking-runner">${o.status === 'DELIVERED' ? '✓' : '🏃'}</div>
              <div class="tracking-point end">🎒</div>
            </div>
            <div class="tracking-motion-label">${statusLabel(o.status)}</div>

            ${['CANCELLED', 'REFUNDED'].includes(o.status) ? '' : `<div class="timeline">${renderTimeline(o)}</div>`}
            <div style="display:flex;flex-direction:column;gap:6px;margin-top:14px">
              ${txLink(o.payment.paymentTx, 'Pago')}${txLink(o.payment.payoutTx, 'Pago al Runner')}${txLink(o.payment.refundTx, 'Reembolso')}
            </div>
          </div>
          ${canCancel ? `<button class="new-order-btn secondary-action" id="cancelBtn">Cancelar pedido${o.status === 'PAID' ? ' (se reembolsa)' : ''}</button>` : ''}
          <a class="new-order-btn" href="pedido.html">Hacer otro pedido</a>
          <a class="new-order-btn secondary-action" href="dashboard.html">Volver a mi cuenta</a>
        `;

        const cancelBtn = document.getElementById('cancelBtn');
        if (cancelBtn) cancelBtn.addEventListener('click', async () => {
          cancelBtn.disabled = true;
          try { await api(`/orders/${o.id}/cancel`, { buyerId: user.id }); toast('Pedido cancelado', '✓'); }
          catch (e) { toast(e.message, '!'); }
          lastKey = ''; refresh();
        });
        const txBtn = document.getElementById('txHashBtn');
        if (txBtn) txBtn.addEventListener('click', async () => {
          const txHash = document.getElementById('txHashInput').value.trim();
          try { await api(`/orders/${o.id}/pay`, { txHash }); toast('Pago verificado en Stellar', '✓'); lastKey = ''; refresh(); }
          catch (e) { document.getElementById('txHashError').textContent = e.message; }
        });
      }
      poll(refresh, 3000);
    }
  }
}

/* ================= RUNNER ================= */
if (document.body.classList.contains('runner-page')) {
  const user = requireUser();
  if (user) {
    const availableBox = document.getElementById('availableOrders');
    const activeBox = document.getElementById('runnerActiveOrders');
    let lastKey = '';

    async function renderRunner(force) {
      let available, mine;
      try {
        [available, mine] = await Promise.all([api('/orders?status=PAID'), api(`/users/${user.id}/orders`)]);
      } catch (e) { availableBox.innerHTML = `<div class="empty-inline">${escapeHTML(e.message)}</div>`; return; }

      const active = mine.asRunner.filter(o => ['ACCEPTED', 'PICKED_UP', 'SETTLING'].includes(o.status));
      document.getElementById('runnerDeliveries').textContent = mine.runnerStats.deliveries;
      document.getElementById('runnerEarnings').textContent = `$${mine.runnerStats.earningsMxn.toFixed(0)}`;
      document.getElementById('badgeAvail').textContent = available.length;
      document.getElementById('badgeMine').textContent = active.length;

      // No redibuja si nada cambió (así no se borra el código que estás tecleando)
      const key = JSON.stringify([available.map(o => o.id), active.map(o => [o.id, o.status])]);
      if (!force && key === lastKey) return;
      lastKey = key;

      availableBox.innerHTML = available.length ? available.map(o => {
        const own = o.buyerId === user.id;
        return `
        <article class="runner-order-card">
          <div class="runner-card-top"><span class="status-pill waiting">Nuevo pedido</span><small>${timeAgoLabel(o.times.paidAt || o.times.createdAt)}</small></div>
          <h3>${itemsLine(o)}</h3>
          <div class="runner-meta"><span>🏪 ${escapeHTML(o.vendor)}</span><span>📍 ${escapeHTML(o.deliverTo)}</span><span>💰 Ganas ${formatMoney(o.pricing.deliveryFeeMxn)}</span></div>
          <p class="runner-buyer">Pedido de ${escapeHTML(firstName(o.buyerName || 'Alumno'))} · compras ${formatMoney(o.pricing.subtotalMxn)} y se te reembolsa al entregar</p>
          <button class="accept-order-btn" data-accept="${o.id}" ${own ? 'disabled style="opacity:.4"' : ''}>${own ? 'Es tu propio pedido' : 'Aceptar pedido'}</button>
        </article>`;
      }).join('') : `<div class="empty-state wide"><div>✨</div><h3>No hay pedidos esperando</h3><p>Cuando alguien pague uno, aparecerá aquí automáticamente.</p></div>`;

      activeBox.innerHTML = active.length ? active.map(o => `
        <article class="runner-order-card active-run">
          <div class="runner-card-top"><span class="status-pill moving">${statusLabel(o.status)}</span><small>Pedido ${shortId(o)}</small></div>
          <h3>${itemsLine(o)}</h3>
          <div class="runner-meta"><span>🏪 ${escapeHTML(o.vendor)}</span><span>📍 ${escapeHTML(o.deliverTo)}</span><span>👤 ${escapeHTML(firstName(o.buyerName || 'Alumno'))}</span></div>
          ${o.status === 'ACCEPTED' ? `<button class="accept-order-btn" data-pickup="${o.id}" style="background:var(--blue)">Ya lo compré, voy en camino</button>` : ''}
          <div class="code-confirm">
            <label for="code-${o.id}">Código de entrega</label>
            <div><input id="code-${o.id}" inputmode="numeric" maxlength="4" placeholder="4 dígitos"><button data-deliver="${o.id}">Confirmar entrega</button></div>
            <small>Pídele al comprador el código que ve en su seguimiento. Al confirmarlo recibes ${escapeHTML(o.pricing.runnerPayoutAsset)} ${escapeHTML(o.pricing.asset)} (producto + envío).</small>
            <div class="form-error" id="error-${o.id}"></div>
          </div>
        </article>`).join('') : `<div class="empty-inline">Aún no has aceptado ningún pedido.</div>`;
    }

    availableBox.addEventListener('click', async (e) => {
      const id = e.target.dataset.accept;
      if (!id) return;
      e.target.disabled = true;
      try {
        await api(`/orders/${id}/accept`, { runnerId: user.id });
        toast('Pedido aceptado. Ya aparece en Mis recorridos.', '🏃');
      } catch (err) { toast(err.message, '!'); }
      renderRunner(true);
    });

    activeBox.addEventListener('click', async (e) => {
      const { pickup, deliver } = e.target.dataset;
      if (pickup) {
        try { await api(`/orders/${pickup}/pickup`, { runnerId: user.id }); toast('¡Vas en camino!', '🏃'); }
        catch (err) { toast(err.message, '!'); }
        renderRunner(true);
      }
      if (deliver) {
        const input = document.getElementById(`code-${deliver}`);
        const error = document.getElementById(`error-${deliver}`);
        error.textContent = '';
        e.target.disabled = true;
        e.target.textContent = 'Liquidando en Stellar…';
        try {
          await api(`/orders/${deliver}/deliver`, { runnerId: user.id, code: input.value.trim() });
          toast('Entrega confirmada. Pago liberado 💸', '✓');
          renderRunner(true);
        } catch (err) {
          error.textContent = err.message;
          input.classList.add('invalid');
          e.target.disabled = false;
          e.target.textContent = 'Confirmar entrega';
        }
      }
    });

    poll(() => renderRunner(false), 4000);
  }
}
