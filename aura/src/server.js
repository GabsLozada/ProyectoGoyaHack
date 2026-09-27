const path = require('path');
const express = require('express');
const cors = require('cors');
const config = require('./config');
const ordersModule = require('./orders');
const stellar = require('./stellar');

const router = ordersModule.router || ordersModule;

if (!router || typeof router !== 'function') {
  throw new Error('orders.js no exporta un router valido: ' + JSON.stringify(Object.keys(ordersModule)));
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, network: config.network, simulate: config.simulate });
});

app.use('/api', router);
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((err, req, res, next) => {
  const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Error interno' });
});

if (!process.env.VERCEL) {
  app.listen(config.port, () => {
    console.log(config.appName + ' corriendo en puerto ' + config.port);
  });
}

module.exports = app;