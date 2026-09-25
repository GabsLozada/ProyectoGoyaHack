const path = require('path');
const express = require('express');
const cors = require('cors');
const config = require('./config');
const { router } = require('./orders');
const stellar = require('./stellar');

const app = express();
app.use(cors());
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, network: config.network, simulate: config.simulate }));
app.use('/api', router);

// El front (presentación + app) va en /public y se sirve desde el mismo servidor
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Error interno' });
});

app.listen(config.port, () => {
  console.log(`${config.appName} backend en http://localhost:${config.port}`);
  console.log(`Red: ${config.network} (${stellar.horizonUrl}) | Asset: ${config.assetCode} | Escrow: ${stellar.escrowAddress()}`);
  if (config.simulate) console.log('⚠  SIMULATE_PAYMENTS=true: no se toca la red');
});
