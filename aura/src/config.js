require('dotenv').config();

const num = (v, d) => (v === undefined || v === '' ? d : Number(v));

module.exports = {
  appName: process.env.APP_NAME || 'AuraCafe',
  port: num(process.env.PORT, 3000),
  dbPath: process.env.DB_PATH || './data.db',
  network: process.env.STELLAR_NETWORK === 'public' ? 'public' : 'testnet',
  horizonUrl: process.env.HORIZON_URL,
  escrowSecret: process.env.ESCROW_SECRET || '',
  assetCode: (process.env.ASSET_CODE || 'XLM').toUpperCase(),
  assetIssuer: process.env.ASSET_ISSUER || '',
  mxnPerUnit: num(process.env.MXN_PER_UNIT, 6),
  deliveryFeeMxn: num(process.env.DELIVERY_FEE_MXN, 15),
  platformFeeMxn: num(process.env.PLATFORM_FEE_MXN, 3),
  simulate: process.env.SIMULATE_PAYMENTS === 'true',
  pollarEnv: process.env.POLLAR_ENV || 'testnet',

  pollarSecretKey: process.env.POLLAR_SECRET_KEY || '',

  pollarApiUrl: process.env.POLLAR_API_URL || '',

  pollarPublishableKey: process.env.POLLAR_PUBLISHABLE_KEY || '',
};
