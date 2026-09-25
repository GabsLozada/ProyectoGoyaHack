// Toda la lógica on-chain: verificar el pago que el usuario hizo desde su wallet Pollar
// hacia la cuenta escrow, y liquidar al Runner (o reembolsar) desde esa cuenta.
const crypto = require('crypto');
const {
  Horizon, Keypair, Asset, Networks, TransactionBuilder, Operation, Memo, StrKey, BASE_FEE,
} = require('@stellar/stellar-sdk');
const config = require('./config');

const horizonUrl = config.horizonUrl
  || (config.network === 'public' ? 'https://horizon.stellar.org' : 'https://horizon-testnet.stellar.org');
const server = new Horizon.Server(horizonUrl);
const networkPassphrase = config.network === 'public' ? Networks.PUBLIC : Networks.TESTNET;

const escrow = config.escrowSecret ? Keypair.fromSecret(config.escrowSecret) : null;
if (!escrow && !config.simulate) {
  console.warn('[stellar] Falta ESCROW_SECRET. Corre `npm run setup:escrow` o usa SIMULATE_PAYMENTS=true');
}

const asset = config.assetCode === 'XLM' ? Asset.native() : new Asset(config.assetCode, config.assetIssuer);

// ---- Montos: se manejan en stroops (1e-7) para no perder centavos ----
const STROOP = 10_000_000;
const mxnToStroops = (mxn) => Math.round((mxn / config.mxnPerUnit) * STROOP);
const stroopsToAmount = (s) => (s / STROOP).toFixed(7);
const amountToStroops = (a) => Math.round(Number(a) * STROOP);

const isValidAddress = (addr) => typeof addr === 'string' && StrKey.isValidEd25519PublicKey(addr);
const escrowAddress = () => (escrow ? escrow.publicKey() : 'GSIMULATED_ESCROW');

function assetMatches(op) {
  if (asset.isNative()) return op.asset_type === 'native';
  return op.asset_code === asset.getCode() && op.asset_issuer === asset.getIssuer();
}

/**
 * Verifica en Horizon que txHash sea un pago exitoso a la escrow,
 * con el memo del pedido y por al menos el monto esperado.
 * Devuelve la dirección que pagó (para reembolsos).
 */
async function verifyPayment({ txHash, memo, minAmount }) {
  if (config.simulate) return { from: 'GSIMULATED_PAYER', amount: minAmount, hash: txHash || `SIM-${crypto.randomUUID()}` };

  let tx;
  try {
    tx = await server.transactions().transaction(txHash).call();
  } catch {
    throw new Error('Transacción no encontrada en Horizon (¿ya se confirmó?)');
  }
  if (!tx.successful) throw new Error('La transacción falló en la red');
  if (tx.memo_type !== 'text' || tx.memo !== memo) throw new Error(`Memo incorrecto: se esperaba "${memo}"`);

  const ops = await server.operations().forTransaction(txHash).call();
  const need = amountToStroops(minAmount);
  const pay = ops.records.find((op) => op.type === 'payment'
    && op.to === escrow.publicKey()
    && assetMatches(op)
    && amountToStroops(op.amount) >= need);

  if (!pay) throw new Error('No hay un pago válido a la escrow por el monto del pedido');
  return { from: pay.from, amount: pay.amount, hash: tx.hash };
}

// Cola: la escrow firma una tx a la vez para no chocar números de secuencia
let queue = Promise.resolve();
function enqueue(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

/** Envía `amount` del asset desde la escrow a `destination`. Devuelve el hash. */
function sendFromEscrow({ destination, amount, memo }) {
  if (config.simulate) return Promise.resolve(`SIM-${crypto.randomUUID()}`);
  return enqueue(async () => {
    const account = await server.loadAccount(escrow.publicKey());
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase })
      .addOperation(Operation.payment({ destination, asset, amount }))
      .addMemo(Memo.text(String(memo).slice(0, 28)))
      .setTimeout(60)
      .build();
    tx.sign(escrow);
    try {
      const res = await server.submitTransaction(tx);
      return res.hash;
    } catch (e) {
      const codes = e?.response?.data?.extras?.result_codes;
      throw new Error(`Stellar rechazó la tx: ${codes ? JSON.stringify(codes) : e.message}`);
    }
  });
}

module.exports = {
  server, asset, escrowAddress, isValidAddress,
  mxnToStroops, stroopsToAmount, verifyPayment, sendFromEscrow, horizonUrl,
};
