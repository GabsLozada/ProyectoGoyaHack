/* Aura — prototipo front-end compartido.
   Para la demo, cuentas, pedidos y estados viven en localStorage. */

requestAnimationFrame(() => document.body.classList.add('loaded'));
window.addEventListener('pageshow', (e) => {
  if (e.persisted) document.body.classList.add('loaded');
});

function goTo(url) {
  document.body.classList.remove('loaded');
  setTimeout(() => { window.location.href = url; }, 180);
}

/* Efecto de luz del cursor */
if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
  const glow = document.createElement('div');
  glow.className = 'cursor-glow';
  document.body.appendChild(glow);
  let raf = null, mx = 0, my = 0;
  window.addEventListener('mousemove', (e) => {
    mx = e.clientX; my = e.clientY;
    glow.classList.add('active');
    if (!raf) {
      raf = requestAnimationFrame(() => {
        glow.style.transform = `translate(${mx}px, ${my}px) translate(-50%, -50%)`;
        raf = null;
      });
    }
  });
  document.addEventListener('mouseleave', () => glow.classList.remove('active'));
}

const ORDER_KEY = 'auracafe_orders';
const ACTIVE_ORDER_KEY = 'auracafe_active_order';
const USER_KEY = 'aura_user';
const ACCOUNTS_KEY = 'aura_accounts';
const RUNNER_STATS_KEY = 'auracafe_runner_stats';

function getJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}
function setJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
function getUser() { return getJSON(USER_KEY, null); }
function getOrders() { return getJSON(ORDER_KEY, []); }
function getAccounts() { return getJSON(ACCOUNTS_KEY, []); }
function getRunnerStats() { return getJSON(RUNNER_STATS_KEY, { earnings: 0, deliveries: 0 }); }

function saveOrders(orders) {
  setJSON(ORDER_KEY, orders);
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
  if (idx < 0) return null;
  orders[idx] = { ...orders[idx], ...patch, updatedAt: Date.now() };
  saveOrders(orders);
  return orders[idx];
}
function uid() {
  return 'ord_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}
function deliveryCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}
function firstName(name='') {
  return (name.trim().split(/\s+/)[0] || 'ahí');
}
function escapeHTML(value='') {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
function formatMoney(n) {
  return `$${Number(n || 0).toFixed(2)} MXN`;
}
function statusLabel(status) {
  return ({ buscando: 'Buscando Runner', en_camino: 'Runner en camino', entregado: 'Entregado' })[status] || status;
}
function statusClass(status) {
  return ({ buscando: 'waiting', en_camino: 'moving', entregado: 'done' })[status] || '';
}
function timeAgoLabel(ts) {
  const mins = Math.floor((Date.now() - Number(ts || Date.now())) / 60000);
  if (mins < 1) return 'justo ahora';
  if (mins === 1) return 'hace 1 min';
  return `hace ${mins} min`;
}
function toast(msg, icon='✓') {
  let stack = document.querySelector('.toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${icon}</span><span>${escapeHTML(msg)}</span>`;
  stack.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(-8px)';
    setTimeout(() => el.remove(), 220);
  }, 2600);
}
function requireUser() {
  const user = getUser();
  if (!user) {
    goTo('auth.html?mode=login');
    return null;
  }
  return user;
}

/* LANDING */
const accountLink = document.getElementById('accountLink');
if (accountLink && getUser()) {
  accountLink.textContent = 'Mi cuenta';
  accountLink.href = 'dashboard.html';
}

/* AUTH — iniciar sesión y crear cuenta son vistas separadas */
if (document.body.classList.contains('auth-page')) {
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
    lead.textContent = isRegister
      ? 'Regístrate con el correo que prefieras.'
      : 'Entra a tu cuenta para continuar.';
    const url = new URL(window.location.href);
    url.searchParams.set('mode', mode);
    history.replaceState(null, '', url);
  }
  tabs.forEach(tab => tab.addEventListener('click', () => setMode(tab.dataset.mode)));
  setMode(new URLSearchParams(location.search).get('mode') === 'register' ? 'register' : 'login');

  registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const error = document.getElementById('registerError');
    error.textContent = '';
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim().toLowerCase();
    const password = document.getElementById('regPass').value;
    if (!name || !email || password.length < 6) {
      error.textContent = 'Completa tus datos y usa una contraseña de al menos 6 caracteres.';
      return;
    }
    const accounts = getAccounts();
    if (accounts.some(a => a.email === email)) {
      error.textContent = 'Ese correo ya tiene una cuenta. Prueba iniciar sesión.';
      return;
    }
    accounts.push({ name, email, password });
    setJSON(ACCOUNTS_KEY, accounts);
    setJSON(USER_KEY, { name, email });
    goTo('dashboard.html');
  });

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const error = document.getElementById('loginError');
    error.textContent = '';
    const email = document.getElementById('logEmail').value.trim().toLowerCase();
    const password = document.getElementById('logPass').value;
    const account = getAccounts().find(a => a.email === email && a.password === password);
    if (!account) {
      error.textContent = 'No encontramos esa combinación de correo y contraseña.';
      return;
    }
    setJSON(USER_KEY, { name: account.name, email: account.email });
    goTo('dashboard.html');
  });
}

/* DASHBOARD */
if (document.body.classList.contains('dashboard-page')) {
  const user = requireUser();
  if (user) {
    document.getElementById('welcomeName').textContent = `Hola, ${firstName(user.name)} 👋`;
    document.getElementById('navUser').textContent = user.email;
    document.getElementById('logoutBtn').addEventListener('click', () => {
      localStorage.removeItem(USER_KEY);
      goTo('index.html');
    });

    function renderDashboard() {
      const all = getOrders();
      const mine = all.filter(o => !o.buyerEmail || o.buyerEmail === user.email);
      const active = mine.find(o => o.status !== 'entregado');
      const activeBox = document.getElementById('dashboardActiveOrder');
      const section = document.getElementById('activeOrderSection');
      const activeStatus = document.getElementById('activeStatus');

      if (!active) {
        activeStatus.textContent = '';
        activeBox.innerHTML = `<div class="empty-state"><div>☕</div><h3>No tienes un pedido activo</h3><p>Cuando hagas uno, aquí verás su estado y tu código de entrega.</p><a class="inline-cta" href="pedido.html">Hacer un pedido →</a></div>`;
      } else {
        activeStatus.textContent = statusLabel(active.status);
        activeBox.innerHTML = `
          <article class="active-order-card">
            <div class="active-order-main">
              <span class="status-pill ${statusClass(active.status)}">${statusLabel(active.status)}</span>
              <h3>${active.items.map(i => `${i.qty}× ${escapeHTML(i.name)}`).join(', ')}</h3>
              <p>${escapeHTML(active.location)} · ${formatMoney(active.total)}</p>
            </div>
            <div class="delivery-code-box compact">
              <small>CÓDIGO DE ENTREGA</small>
              <strong>${escapeHTML(active.deliveryCode || '----')}</strong>
              <span>Dáselo al Runner cuando tengas tu pedido.</span>
            </div>
            <a href="pedido.html" class="inline-cta">Ver seguimiento →</a>
          </article>`;
      }

      const history = mine.filter(o => o.status === 'entregado');
      document.getElementById('historyCount').textContent = `${history.length} entregado${history.length === 1 ? '' : 's'}`;
      document.getElementById('orderHistory').innerHTML = history.length ? history.map(o => `
        <article class="history-row">
          <div><strong>${o.items.map(i => `${i.qty}× ${escapeHTML(i.name)}`).join(', ')}</strong><span>${escapeHTML(o.location)}</span></div>
          <div><strong>${formatMoney(o.total)}</strong><span>${timeAgoLabel(o.deliveredAt || o.createdAt)}</span></div>
        </article>`).join('') : `<div class="empty-inline">Todavía no hay entregas en tu historial.</div>`;
    }
    renderDashboard();
    window.addEventListener('storage', (e) => { if (e.key === ORDER_KEY) renderDashboard(); });
    window.addEventListener('orders-changed', renderDashboard);
  }
}

/* PEDIDO */
const PRODUCTS = [
  { id:'americano', name:'Café Americano', emoji:'☕', desc:'Calientito, directo de la cafetería.', price:25, source:'Cafetería Ingeniería' },
  { id:'chilaquiles', name:'Chilaquiles Express', emoji:'🌶️', desc:'Para sobrevivir al entre-clases.', price:45, source:'Cafetería Los Pumitas' },
  { id:'energetica', name:'Bebida Energética', emoji:'⚡', desc:'Para el examen final.', price:35, source:'OXXO Anexo' },
  { id:'panditas', name:'Combo Panditas + Agua', emoji:'🍬', desc:'Antojo rápido y dulce.', price:30, source:'OXXO Anexo' },
];
const LOCATIONS = ['Edificio Q · Q-103', 'Anexo A · A-202', 'Bloque C · C-310', 'Biblioteca central'];

if (document.getElementById('productList')) {
  const user = requireUser();
  if (user) {
    const cart = {};
    let selectedLocation = '';
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

    function renderProducts() {
      productList.innerHTML = PRODUCTS.map(p => {
        const qty = cart[p.id] || 0;
        return `<div class="product-card">
          <div class="product-emoji">${p.emoji}</div>
          <div class="product-info"><h3>${p.name}</h3><p>${p.desc}</p><span class="product-price">${formatMoney(p.price)}</span></div>
          ${qty === 0
            ? `<button class="add-btn" data-add="${p.id}">Agregar</button>`
            : `<div class="stepper"><button data-dec="${p.id}">−</button><span class="qty">${qty}</span><button data-inc="${p.id}">+</button></div>`}
        </div>`;
      }).join('');
    }
    function updateCartBar() {
      const items = Object.values(cart).reduce((a,b) => a+b, 0);
      const total = PRODUCTS.reduce((sum,p) => sum + (cart[p.id] || 0) * p.price, 0);
      cartCount.textContent = items;
      cartTotal.textContent = formatMoney(total);
      cartBar.classList.toggle('visible', items > 0);
    }
    productList.addEventListener('click', (e) => {
      const add = e.target.dataset.add, inc = e.target.dataset.inc, dec = e.target.dataset.dec;
      if (add) cart[add] = 1;
      if (inc) cart[inc] = (cart[inc] || 0) + 1;
      if (dec) {
        cart[dec] = Math.max(0, (cart[dec] || 0) - 1);
        if (!cart[dec]) delete cart[dec];
      }
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
      const lines = PRODUCTS.filter(p => cart[p.id]).map(p => `<div class="summary-row"><span>${cart[p.id]}× ${p.name}</span><span>${formatMoney(cart[p.id]*p.price)}</span></div>`).join('');
      const total = PRODUCTS.reduce((sum,p) => sum + (cart[p.id] || 0) * p.price, 0);
      sheetSummary.innerHTML = lines + `<div class="summary-row total"><span>Total</span><span>${formatMoney(total)}</span></div>`;
      overlay.classList.add('visible');
      sheet.classList.add('visible');
      confirmBtn.disabled = !selectedLocation;
    }
    function closeSheet() {
      overlay.classList.remove('visible');
      sheet.classList.remove('visible');
    }
    document.getElementById('cartBarCta').addEventListener('click', openSheet);
    overlay.addEventListener('click', closeSheet);

    confirmBtn.addEventListener('click', () => {
      if (!selectedLocation) return;
      const items = PRODUCTS.filter(p => cart[p.id]).map(p => ({ id:p.id, name:p.name, emoji:p.emoji, qty:cart[p.id], price:p.price, source:p.source }));
      const total = items.reduce((s,i) => s + i.qty*i.price, 0);
      const order = {
        id: uid(),
        items,
        total,
        location: selectedLocation,
        status: 'buscando',
        createdAt: Date.now(),
        buyerName: user.name,
        buyerEmail: user.email,
        runnerName: null,
        runnerEmail: null,
        deliveryCode: deliveryCode()
      };
      addOrder(order);
      localStorage.setItem(ACTIVE_ORDER_KEY, order.id);
      closeSheet();
      toast(`Pedido enviado. Tu código es ${order.deliveryCode}`, '🔐');
      showTracking(order.id);
    });

    function renderTimeline(order) {
      const steps = [
        { title:'Pedido confirmado', sub:'Tu pedido ya está publicado para los Runners.' },
        { title:'Runner en camino', sub:order.runnerName ? `${escapeHTML(order.runnerName)} tomó tu pedido y va en camino.` : 'En cuanto alguien lo acepte, lo verás aquí.' },
        { title:'Entregado', sub:'El Runner confirma la entrega con tu código.' }
      ];
      const current = ({buscando:0,en_camino:1,entregado:2})[order.status] ?? 0;
      return steps.map((s,i) => `
        <div class="tl-step ${i < current ? 'done' : i === current ? 'active' : ''}">
          ${i < steps.length - 1 ? '<div class="tl-line"></div>' : ''}
          <div class="tl-dot">${i < current ? '✓' : i === 0 ? '📝' : i === 1 ? '🏃' : '🎉'}</div>
          <div class="tl-text"><div class="tl-title">${s.title}</div><div class="tl-sub">${s.sub}</div></div>
        </div>`).join('');
    }

    function showTracking(orderId) {
      const order = getOrders().find(o => o.id === orderId);
      if (!order) {
        menuView.style.display = '';
        trackingView.style.display = 'none';
        return;
      }
      menuView.style.display = 'none';
      trackingView.style.display = '';
      cartBar.classList.remove('visible');

      const moveClass = order.status === 'entregado' ? 'arrived' : 'moving';
      const stageText = order.status === 'buscando'
        ? 'Buscando un Runner…'
        : order.status === 'en_camino'
          ? `${escapeHTML(order.runnerName || 'Tu Runner')} va en camino`
          : 'Pedido entregado';

      trackingView.innerHTML = `
        <div class="tracking-card">
          <span class="eyebrow">PEDIDO ${escapeHTML(order.id.slice(-5).toUpperCase())}</span>
          <h2>${order.items.map(i => `${i.qty}× ${escapeHTML(i.name)}`).join(', ')}</h2>
          <p class="tracking-destination">${escapeHTML(order.location)} · ${formatMoney(order.total)}</p>

          <div class="delivery-code-box">
            <small>TU CÓDIGO DE ENTREGA</small>
            <strong>${escapeHTML(order.deliveryCode || '----')}</strong>
            <span>No lo compartas hasta tener el pedido contigo.</span>
          </div>

          <div class="tracking-motion ${moveClass}">
            <div class="tracking-motion-line"></div>
            <div class="tracking-point start">☕</div>
            <div class="tracking-runner">${order.status === 'entregado' ? '✓' : '🏃'}</div>
            <div class="tracking-point end">🎒</div>
          </div>
          <div class="tracking-motion-label">${stageText}</div>

          <div class="timeline">${renderTimeline(order)}</div>
        </div>
        ${order.status === 'entregado' ? '<button class="new-order-btn" id="newOrderBtn">Hacer otro pedido</button>' : '<a class="new-order-btn secondary-action" href="dashboard.html">Volver a mi cuenta</a>'}
      `;
      const btn = document.getElementById('newOrderBtn');
      if (btn) btn.addEventListener('click', () => {
        localStorage.removeItem(ACTIVE_ORDER_KEY);
        Object.keys(cart).forEach(k => delete cart[k]);
        selectedLocation = '';
        locInput.value = '';
        renderProducts();
        updateCartBar();
        menuView.style.display = '';
        trackingView.style.display = 'none';
      });
    }

    function refreshActive() {
      const activeId = localStorage.getItem(ACTIVE_ORDER_KEY);
      if (activeId) showTracking(activeId);
    }
    window.addEventListener('storage', (e) => { if (e.key === ORDER_KEY) refreshActive(); });
    window.addEventListener('orders-changed', refreshActive);

    renderProducts();
    updateCartBar();
    const existingId = localStorage.getItem(ACTIVE_ORDER_KEY);
    if (existingId && getOrders().some(o => o.id === existingId)) showTracking(existingId);
  }
}

/* RUNNER */
if (document.body.classList.contains('runner-page')) {
  const user = requireUser();
  if (user) {
    function renderRunner() {
      const orders = getOrders();
      const available = orders.filter(o => o.status === 'buscando');
      const active = orders.filter(o => o.status === 'en_camino' && o.runnerEmail === user.email);
      const stats = getRunnerStats();
      document.getElementById('runnerDeliveries').textContent = stats.deliveries || 0;

      const availableBox = document.getElementById('availableOrders');
      availableBox.innerHTML = available.length ? available.map(o => `
        <article class="runner-order-card">
          <div class="runner-card-top"><span class="status-pill waiting">Nuevo pedido</span><small>${timeAgoLabel(o.createdAt)}</small></div>
          <h3>${o.items.map(i => `${i.qty}× ${escapeHTML(i.name)}`).join(', ')}</h3>
          <div class="runner-meta"><span>📍 ${escapeHTML(o.location)}</span><span>💳 ${formatMoney(o.total)}</span></div>
          <p class="runner-buyer">Pedido de ${escapeHTML(firstName(o.buyerName || 'Alumno'))}</p>
          <button class="accept-order-btn" data-accept="${escapeHTML(o.id)}">Aceptar pedido</button>
        </article>`).join('') : `<div class="empty-state wide"><div>✨</div><h3>No hay pedidos esperando</h3><p>Cuando alguien confirme uno, aparecerá aquí automáticamente.</p></div>`;

      const activeBox = document.getElementById('runnerActiveOrders');
      activeBox.innerHTML = active.length ? active.map(o => `
        <article class="runner-order-card active-run">
          <div class="runner-card-top"><span class="status-pill moving">En camino</span><small>Pedido ${escapeHTML(o.id.slice(-5).toUpperCase())}</small></div>
          <h3>${o.items.map(i => `${i.qty}× ${escapeHTML(i.name)}`).join(', ')}</h3>
          <div class="runner-meta"><span>📍 ${escapeHTML(o.location)}</span><span>👤 ${escapeHTML(firstName(o.buyerName || 'Alumno'))}</span></div>
          <div class="code-confirm">
            <label for="code-${escapeHTML(o.id)}">Código de entrega</label>
            <div><input id="code-${escapeHTML(o.id)}" inputmode="numeric" maxlength="4" placeholder="4 dígitos"><button data-deliver="${escapeHTML(o.id)}">Confirmar entrega</button></div>
            <small>El comprador ve este código en su seguimiento y en Mi cuenta.</small>
            <div class="form-error" id="error-${escapeHTML(o.id)}"></div>
          </div>
        </article>`).join('') : `<div class="empty-inline">Aún no has aceptado ningún pedido.</div>`;
    }

    document.getElementById('availableOrders').addEventListener('click', (e) => {
      const id = e.target.dataset.accept;
      if (!id) return;
      const order = getOrders().find(o => o.id === id);
      if (!order || order.status !== 'buscando') {
        toast('Ese pedido ya no está disponible.', '!');
        renderRunner();
        return;
      }
      updateOrder(id, { status:'en_camino', runnerName:user.name, runnerEmail:user.email, acceptedAt:Date.now() });
      toast('Pedido aceptado. Ya aparece en Mis recorridos.', '🏃');
      renderRunner();
    });

    document.getElementById('runnerActiveOrders').addEventListener('click', (e) => {
      const id = e.target.dataset.deliver;
      if (!id) return;
      const order = getOrders().find(o => o.id === id);
      if (!order) return;
      const input = document.getElementById(`code-${id}`);
      const error = document.getElementById(`error-${id}`);
      const typed = (input.value || '').trim();
      if (typed !== String(order.deliveryCode || '')) {
        error.textContent = 'El código no coincide. Pídeselo al comprador.';
        input.classList.add('invalid');
        return;
      }
      const fee = Math.max(10, Math.round(Number(order.total || 0) * 0.20));
      updateOrder(id, { status:'entregado', deliveredAt:Date.now() });
      const stats = getRunnerStats();
      setJSON(RUNNER_STATS_KEY, { earnings:Number(stats.earnings || 0) + fee, deliveries:Number(stats.deliveries || 0) + 1 });
      toast('Entrega confirmada. El pedido quedó completado.', '✓');
      renderRunner();
    });

    renderRunner();
    window.addEventListener('storage', (e) => { if (e.key === ORDER_KEY) renderRunner(); });
    window.addEventListener('orders-changed', renderRunner);
  }
}
