/* ===== AuraCafé — lógica del panel Runner ===== */

if (document.getElementById('orderList')) {
  const RUNNER_NAME = 'Ana R.'; // demo fijo; en producción vendría del login
  const COMMISSION = 10;

  let activeTab = 'disponibles';
  const orderList = document.getElementById('orderList');
  const tabAvail = document.getElementById('tabAvail');
  const tabMine = document.getElementById('tabMine');
  const badgeAvail = document.getElementById('badgeAvail');
  const badgeMine = document.getElementById('badgeMine');
  const statEarnings = document.getElementById('statEarnings');
  const statDeliveries = document.getElementById('statDeliveries');
  const availToggle = document.getElementById('availToggle');

  function timerClass(mins) {
    if (mins >= 8) return 'hot';
    if (mins >= 4) return 'warn';
    return '';
  }

  function render() {
    const orders = getOrders();
    const pending = orders.filter(o => o.status === 'buscando');
    const mine = orders.filter(o => o.status === 'en_camino' && o.runnerName === RUNNER_NAME);

    badgeAvail.textContent = pending.length;
    badgeMine.textContent = mine.length;

    const stats = getRunnerStats();
    statEarnings.textContent = `$${stats.earnings.toFixed(0)}`;
    statDeliveries.textContent = stats.deliveries;

    const list = activeTab === 'disponibles' ? pending : mine;

    if (list.length === 0) {
      orderList.innerHTML = `
        <div class="empty-state">
          <div class="icon">${activeTab === 'disponibles' ? '🧘' : '📦'}</div>
          <p>${activeTab === 'disponibles'
            ? 'No hay pedidos disponibles ahora mismo.<br>Vuelve en un momento.'
            : 'No tienes entregas activas.<br>Acepta un pedido para empezar.'}</p>
        </div>`;
      return;
    }

    orderList.innerHTML = list.map(o => {
      const mins = Math.floor((Date.now() - o.createdAt) / 60000);
      const itemsLine = o.items.map(i => `${i.qty}× ${i.name} ${i.emoji}`).join(', ');
      const source = o.items[0]?.source || 'Cafetería';
      if (activeTab === 'disponibles') {
        return `
          <div class="runner-card" data-id="${o.id}">
            <div class="rc-top">
              <span class="rc-source">${source}</span>
              <span class="rc-timer ${timerClass(mins)}">⏱ ${mins < 1 ? 'nuevo' : mins + ' min'}</span>
            </div>
            <div class="rc-items">${itemsLine}</div>
            <div class="rc-dest">📍 ${o.location}</div>
            <div class="rc-client">Pago asegurado con Pollar · se liquida en Stellar</div>
            <div class="rc-actions">
              <button class="rc-btn accept" data-accept="${o.id}">Aceptar pedido 🚀</button>
            </div>
          </div>`;
      } else {
        return `
          <div class="runner-card" data-id="${o.id}">
            <div class="rc-top">
              <span class="rc-source">${source}</span>
              <span class="rc-timer">🏃 en camino</span>
            </div>
            <div class="rc-items">${itemsLine}</div>
            <div class="rc-dest">📍 Llevar a: ${o.location}</div>
            <div class="rc-client">Comisión al entregar: $${COMMISSION.toFixed(2)}</div>
            <div class="rc-actions">
              <button class="rc-btn deliver" data-deliver="${o.id}">Marcar entregado ✅</button>
            </div>
          </div>`;
      }
    }).join('');
  }

  orderList.addEventListener('click', (e) => {
    const acceptId = e.target.dataset.accept;
    const deliverId = e.target.dataset.deliver;
    if (acceptId) {
      updateOrder(acceptId, { status: 'en_camino', runnerName: RUNNER_NAME });
      toast('Pedido aceptado. ¡Ve por él! 🏃', '🏃');
      activeTab = 'mis-entregas';
      setActiveTab();
    } else if (deliverId) {
      updateOrder(deliverId, { status: 'entregado' });
      const stats = getRunnerStats();
      stats.earnings += COMMISSION;
      stats.deliveries += 1;
      saveRunnerStats(stats);
      toast(`¡Entregado! +$${COMMISSION.toFixed(2)} liquidado en Stellar`, '💰');
      render();
    }
  });

  function setActiveTab() {
    tabAvail.classList.toggle('active', activeTab === 'disponibles');
    tabMine.classList.toggle('active', activeTab === 'mis-entregas');
    render();
  }
  tabAvail.addEventListener('click', () => { activeTab = 'disponibles'; setActiveTab(); });
  tabMine.addEventListener('click', () => { activeTab = 'mis-entregas'; setActiveTab(); });

  availToggle.addEventListener('click', () => availToggle.classList.toggle('on'));

  window.addEventListener('storage', (e) => { if (e.key === STORAGE_KEY) render(); });
  window.addEventListener('orders-changed', render);

  render();
  setInterval(render, 15000); // refresca timers de espera cada 15s
}
