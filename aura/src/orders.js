const crypto = require('crypto');
const express = require('express');
const db = require('./db');
const config = require('./config');
const stellar = require('./stellar');

const router = express.Router();

// ---------- helpers ----------
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const now = () => new Date().toISOString();

const getOrder = (id) => {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!o) throw new HttpError(404, 'Pedido no encontrado');
  return o;
};
const getUser = (id) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!u) throw new HttpError(404, 'Usuario no encontrado');
  return u;
};

// Cambia de estado solo si el pedido está en uno de `from` (evita carreras: 2 runners aceptando el mismo)
function transition(id, from, to, extra = {}) {
  const sets = Object.keys(extra).map((k) => `${k} = @${k}`);
  const sql = `UPDATE orders SET status = @to, updated_at = @now${sets.length ? ', ' + sets.join(', ') : ''}
               WHERE id = @id AND status IN (${from.map((_, i) => `@f${i}`).join(',')})`;
  const params = { id, to, now: now(), ...extra };
  from.forEach((s, i) => { params[`f${i}`] = s; });
  return db.prepare(sql).run(params).changes === 1;
}

const nameStmt = db.prepare('SELECT name FROM users WHERE id = ?');
const nameOf = (id) => nameStmt.get(id)?.name || null;

function serialize(o, { withCode = false } = {}) {
  const out = {
    id: o.id,
    status: o.status,
    vendor: o.vendor,
    items: JSON.parse(o.items_json),
    deliverTo: o.deliver_to,
    notes: o.notes,
    buyerId: o.buyer_id,
    buyerName: nameOf(o.buyer_id),
    runnerId: o.runner_id,
    runnerName: o.runner_id ? nameOf(o.runner_id) : null,
    pricing: {
      subtotalMxn: o.subtotal_mxn,
      deliveryFeeMxn: o.delivery_fee_mxn,
      platformFeeMxn: o.platform_fee_mxn,
      totalMxn: o.total_mxn,
      asset: config.assetCode,
      totalAsset: o.total_asset,
      runnerPayoutAsset: o.runner_payout_asset,
    },
    payment: {
      escrowAddress: stellar.escrowAddress(),
      memo: o.memo,
      paymentTx: o.payment_tx,
      payoutTx: o.payout_tx,
      refundTx: o.refund_tx,
    },
    times: {
      createdAt: o.created_at, paidAt: o.paid_at, acceptedAt: o.accepted_at,
      pickedUpAt: o.picked_up_at, deliveredAt: o.delivered_at,
    },
  };
  if (withCode) out.deliveryCode = o.delivery_code;
  return out;
}

// ---------- config / menú / usuarios ----------
router.get('/config', (req, res) => {
  res.json({
    appName: config.appName,
    network: config.network,
    asset: config.assetCode,
    assetIssuer: config.assetIssuer || null,
    escrowAddress: stellar.escrowAddress(),
    mxnPerUnit: config.mxnPerUnit,
    deliveryFeeMxn: config.deliveryFeeMxn,
    platformFeeMxn: config.platformFeeMxn,
    simulate: config.simulate,
  });
});

router.get('/menu', (req, res) => {
  const rows = db.prepare('SELECT id, vendor, name, price_mxn AS priceMxn, emoji, description FROM menu_items WHERE available = 1 ORDER BY vendor, id').all();
  const byVendor = {};
  rows.forEach((r) => { (byVendor[r.vendor] ||= []).push(r); });
  res.json(byVendor);
});

// ---------- cuentas (correo + contraseña) ----------
const hashPassword = (pw, salt = crypto.randomBytes(16).toString('hex')) =>
  `${salt}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
const checkPassword = (pw, stored) => {
  const [salt, hash] = String(stored).split(':');
  const test = crypto.scryptSync(pw, salt, 64);
  return crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'));
};
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, stellarAddress: u.stellar_address });

router.post('/auth/register', (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 6) {
    throw new HttpError(400, 'Completa tus datos y usa una contraseña de al menos 6 caracteres.');
  }
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    throw new HttpError(409, 'Ese correo ya tiene una cuenta. Prueba iniciar sesión.');
  }
  const info = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
    .run(name.slice(0, 60), email, hashPassword(password));
  res.status(201).json(publicUser(getUser(info.lastInsertRowid)));
});

router.post('/auth/login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!u || !checkPassword(String(req.body?.password || ''), u.password_hash)) {
    throw new HttpError(401, 'No encontramos esa combinación de correo y contraseña.');
  }
  res.json(publicUser(u));
});

// Pollar: al conectar la wallet, el front manda su dirección G...
router.put('/users/:id/wallet', (req, res) => {
  const u = getUser(Number(req.params.id));
  const addr = req.body?.stellarAddress;
  if (!stellar.isValidAddress(addr)) throw new HttpError(400, 'stellarAddress inválida');
  try {
    db.prepare('UPDATE users SET stellar_address = ? WHERE id = ?').run(addr, u.id);
  } catch {
    throw new HttpError(409, 'Esa wallet ya está ligada a otra cuenta');
  }
  res.json(publicUser(getUser(u.id)));
});

router.get('/users/:id/orders', (req, res) => {
  const uid = Number(req.params.id);
  getUser(uid);
  const asBuyer = db.prepare('SELECT * FROM orders WHERE buyer_id = ? ORDER BY id DESC LIMIT 50').all(uid);
  const asRunner = db.prepare('SELECT * FROM orders WHERE runner_id = ? ORDER BY id DESC LIMIT 50').all(uid);
  const delivered = asRunner.filter((o) => o.status === 'DELIVERED');
  res.json({
    asBuyer: asBuyer.map((o) => serialize(o, { withCode: true })),
    asRunner: asRunner.map((o) => serialize(o)),
    runnerStats: {
      deliveries: delivered.length,
      earningsMxn: delivered.reduce((s, o) => s + o.delivery_fee_mxn, 0),
    },
  });
});

// ---------- pedidos ----------
// 1) Crear pedido -> devuelve monto, escrow y memo para pagar con Pollar
router.post('/orders', (req, res) => {
  const { buyerId, items, deliverTo, notes } = req.body || {};
  getUser(Number(buyerId));
  if (!deliverTo || !String(deliverTo).trim()) throw new HttpError(400, 'Falta deliverTo (salón / edificio)');
  if (!Array.isArray(items) || items.length === 0 || items.length > 8) throw new HttpError(400, 'items debe tener 1 a 8 productos');

  const findItem = db.prepare('SELECT * FROM menu_items WHERE id = ? AND available = 1');
  const lines = items.map(({ menuItemId, qty }) => {
    const m = findItem.get(Number(menuItemId));
    const q = Number(qty) || 1;
    if (!m) throw new HttpError(400, `Producto ${menuItemId} no disponible`);
    if (q < 1 || q > 5) throw new HttpError(400, 'qty entre 1 y 5');
    return { menuItemId: m.id, name: m.name, qty: q, priceMxn: m.price_mxn, vendor: m.vendor };
  });
  const vendors = [...new Set(lines.map((l) => l.vendor))];
  if (vendors.length > 1) throw new HttpError(400, 'Un pedido = un solo local (el Runner va a un lugar)');

  const subtotal = lines.reduce((s, l) => s + l.priceMxn * l.qty, 0);
  const total = subtotal + config.deliveryFeeMxn + config.platformFeeMxn;
  const totalStroops = stellar.mxnToStroops(total);
  const payoutStroops = stellar.mxnToStroops(subtotal + config.deliveryFeeMxn); // producto + envío -> Runner

  const memo = `AC-${crypto.randomBytes(5).toString('hex')}`;
  const code = String(crypto.randomInt(0, 10000)).padStart(4, '0');

  const info = db.prepare(`INSERT INTO orders
    (buyer_id, vendor, items_json, deliver_to, notes, subtotal_mxn, delivery_fee_mxn, platform_fee_mxn,
     total_mxn, total_asset, runner_payout_asset, memo, delivery_code)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    Number(buyerId), vendors[0], JSON.stringify(lines.map(({ vendor, ...l }) => l)),
    String(deliverTo).trim().slice(0, 80), notes ? String(notes).slice(0, 200) : null,
    subtotal, config.deliveryFeeMxn, config.platformFeeMxn, total,
    stellar.stroopsToAmount(totalStroops), stellar.stroopsToAmount(payoutStroops), memo, code,
  );
  res.status(201).json(serialize(getOrder(info.lastInsertRowid), { withCode: true }));
});

// 2) Confirmar pago: el front manda el hash que devolvió Pollar
router.post('/orders/:id/pay', h(async (req, res) => {
  const o = getOrder(Number(req.params.id));
  if (o.status !== 'PENDING_PAYMENT') throw new HttpError(409, `El pedido ya está en ${o.status}`);
  const { txHash } = req.body || {};
  if (!txHash && !config.simulate) throw new HttpError(400, 'Falta txHash');

  let p;
  try { p = await stellar.verifyPayment({ txHash, memo: o.memo, minAmount: o.total_asset }); }
  catch (e) { throw new HttpError(402, e.message); }

  try {
    const ok = transition(o.id, ['PENDING_PAYMENT'], 'PAID', { payment_tx: p.hash, payer_address: p.from, paid_at: now() });
    if (!ok) throw new HttpError(409, 'El pedido cambió de estado');
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new HttpError(409, 'Ese txHash ya se usó en otro pedido');
    throw e;
  }
  res.json(serialize(getOrder(o.id), { withCode: true }));
}));

// Feed de Runners (por defecto: pedidos pagados esperando quién los lleve)
router.get('/orders', (req, res) => {
  const status = String(req.query.status || 'PAID').toUpperCase();
  const rows = db.prepare('SELECT * FROM orders WHERE status = ? ORDER BY id ASC LIMIT 50').all(status);
  res.json(rows.map((o) => serialize(o)));
});

router.get('/orders/:id', (req, res) => res.json(serialize(getOrder(Number(req.params.id)))));

// 3) Runner toma el pedido
router.post('/orders/:id/accept', (req, res) => {
  const o = getOrder(Number(req.params.id));
  const runnerId = Number(req.body?.runnerId);
  getUser(runnerId);
  if (runnerId === o.buyer_id) throw new HttpError(400, 'No puedes ser Runner de tu propio pedido');
  const ok = transition(o.id, ['PAID'], 'ACCEPTED', { runner_id: runnerId, accepted_at: now() });
  if (!ok) throw new HttpError(409, 'Otro Runner ya lo tomó o no está pagado');
  res.json(serialize(getOrder(o.id)));
});

// 4) Runner ya lo compró / va en camino
router.post('/orders/:id/pickup', (req, res) => {
  const o = getOrder(Number(req.params.id));
  if (Number(req.body?.runnerId) !== o.runner_id) throw new HttpError(403, 'No eres el Runner de este pedido');
  if (!transition(o.id, ['ACCEPTED'], 'PICKED_UP', { picked_up_at: now() })) throw new HttpError(409, `Estado actual: ${o.status}`);
  res.json(serialize(getOrder(o.id)));
});

// 5) Entrega: el comprador le dicta el código al Runner en la puerta -> se libera el pago en Stellar
router.post('/orders/:id/deliver', h(async (req, res) => {
  const o = getOrder(Number(req.params.id));
  const runnerId = Number(req.body?.runnerId);
  if (runnerId !== o.runner_id) throw new HttpError(403, 'No eres el Runner de este pedido');
  if (String(req.body?.code) !== o.delivery_code) throw new HttpError(400, 'Código de entrega incorrecto');

  const prev = o.status;
  if (!transition(o.id, ['ACCEPTED', 'PICKED_UP'], 'SETTLING')) throw new HttpError(409, `Estado actual: ${o.status}`);

  const runner = getUser(runnerId);
  const dest = runner.stellar_address || (config.simulate ? 'GSIMULATED_RUNNER' : null);
  if (!dest) {
    transition(o.id, ['SETTLING'], prev);
    throw new HttpError(400, 'Conecta tu wallet (Pollar) para poder cobrar la entrega');
  }
  try {
    const hash = await stellar.sendFromEscrow({ destination: dest, amount: o.runner_payout_asset, memo: o.memo });
    transition(o.id, ['SETTLING'], 'DELIVERED', { payout_tx: hash, delivered_at: now() });
  } catch (e) {
    transition(o.id, ['SETTLING'], prev); // se puede reintentar
    throw new HttpError(502, `No se pudo liquidar: ${e.message}`);
  }
  res.json(serialize(getOrder(o.id)));
}));

// Cancelar: sin pagar -> se cancela; pagado y nadie lo ha tomado -> reembolso automático
router.post('/orders/:id/cancel', h(async (req, res) => {
  const o = getOrder(Number(req.params.id));
  if (Number(req.body?.buyerId) !== o.buyer_id) throw new HttpError(403, 'Solo el comprador puede cancelar');

  if (o.status === 'PENDING_PAYMENT') {
    transition(o.id, ['PENDING_PAYMENT'], 'CANCELLED');
    return res.json(serialize(getOrder(o.id)));
  }
  if (!transition(o.id, ['PAID'], 'REFUNDING')) throw new HttpError(409, 'Ya lo tomó un Runner, no se puede cancelar');
  try {
    const hash = await stellar.sendFromEscrow({ destination: o.payer_address, amount: o.total_asset, memo: `RF-${o.memo}` });
    transition(o.id, ['REFUNDING'], 'REFUNDED', { refund_tx: hash });
  } catch (e) {
    transition(o.id, ['REFUNDING'], 'PAID');
    throw new HttpError(502, `No se pudo reembolsar: ${e.message}`);
  }
  res.json(serialize(getOrder(o.id)));
}));

// Métricas en vivo para la slide de tracción
router.get('/stats', (req, res) => {
  const s = db.prepare(`SELECT
      COUNT(*) AS delivered,
      COALESCE(SUM(total_mxn), 0) AS gmvMxn,
      COALESCE(SUM(delivery_fee_mxn), 0) AS runnerEarningsMxn,
      COALESCE(SUM(platform_fee_mxn), 0) AS platformRevenueMxn,
      AVG((julianday(delivered_at) - julianday(paid_at)) * 1440) AS avgMinutesPaidToDelivered
    FROM orders WHERE status = 'DELIVERED'`).get();
  const open = db.prepare(`SELECT COUNT(*) AS n FROM orders WHERE status IN ('PAID','ACCEPTED','PICKED_UP')`).get().n;
  res.json({ ...s, avgMinutesPaidToDelivered: s.avgMinutesPaidToDelivered ? Number(s.avgMinutesPaidToDelivered.toFixed(1)) : null, openOrders: open });
});

module.exports = { router, HttpError };
