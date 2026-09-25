const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  stellar_address TEXT UNIQUE,            -- se llena al conectar la wallet de Pollar
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor TEXT NOT NULL,
  name TEXT NOT NULL,
  price_mxn REAL NOT NULL,
  emoji TEXT DEFAULT '🛍️',
  description TEXT DEFAULT '',
  available INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  buyer_id INTEGER NOT NULL REFERENCES users(id),
  runner_id INTEGER REFERENCES users(id),
  vendor TEXT NOT NULL,
  items_json TEXT NOT NULL,
  deliver_to TEXT NOT NULL,
  notes TEXT,
  subtotal_mxn REAL NOT NULL,
  delivery_fee_mxn REAL NOT NULL,
  platform_fee_mxn REAL NOT NULL,
  total_mxn REAL NOT NULL,
  total_asset TEXT NOT NULL,
  runner_payout_asset TEXT NOT NULL,
  memo TEXT NOT NULL UNIQUE,
  delivery_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
  payer_address TEXT,
  payment_tx TEXT UNIQUE,
  payout_tx TEXT,
  refund_tx TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  paid_at TEXT,
  accepted_at TEXT,
  picked_up_at TEXT,
  delivered_at TEXT,
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
`);

// Menú semilla (edítenlo con precios reales)
const { c } = db.prepare('SELECT COUNT(*) AS c FROM menu_items').get();
if (c === 0) {
  const ins = db.prepare('INSERT INTO menu_items (vendor, name, price_mxn, emoji, description) VALUES (?, ?, ?, ?, ?)');
  const seed = [
    ['Cafetería Ingeniería', 'Café Americano', 25, '☕', 'Calientito, directo de la cafetería.'],
    ['Cafetería Ingeniería', 'Capuchino', 35, '☕', 'Con espuma, para la clase de las 7.'],
    ['Cafetería Los Pumitas', 'Chilaquiles Express', 45, '🌶️', 'Para sobrevivir al entre-clases.'],
    ['Cafetería Los Pumitas', 'Torta de milanesa', 50, '🥪', 'La que llena de verdad.'],
    ['OXXO Anexo', 'Bebida Energética', 35, '⚡', 'Para el examen final.'],
    ['OXXO Anexo', 'Combo Panditas + Agua', 30, '🍬', 'Antojo rápido y dulce.'],
  ];
  db.exec('BEGIN'); seed.forEach((r) => ins.run(...r)); db.exec('COMMIT');
}

module.exports = db;
