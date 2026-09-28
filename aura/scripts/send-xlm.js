// Manda XLM de testnet desde la escrow a cualquier wallet (para fondear cuentas de Pollar
// que ya existen pero tienen poco saldo, donde Friendbot responde 400).
// Uso (desde la carpeta aura):  node scripts/send-xlm.js G... 100
require('dotenv').config();
const {
  Horizon, Keypair, Networks, TransactionBuilder, Operation, Asset, BASE_FEE, StrKey,
} = require('@stellar/stellar-sdk');

const dest = process.argv[2];
const amount = process.argv[3] || '100';
if (!dest || !StrKey.isValidEd25519PublicKey(dest)) {
  console.error('Uso: node scripts/send-xlm.js <G...> [cantidad]');
  process.exit(1);
}
const secret = (process.env.ESCROW_SECRET || '').trim().replace(/^["']|["']$/g, '');
if (!StrKey.isValidEd25519SecretSeed(secret)) {
  console.error('Falta un ESCROW_SECRET válido en tu .env');
  process.exit(1);
}

const server = new Horizon.Server('https://horizon-testnet.stellar.org');
const escrow = Keypair.fromSecret(secret);

(async () => {
  const source = await server.loadAccount(escrow.publicKey());
  let exists = true;
  try { await server.loadAccount(dest); } catch { exists = false; }

  const op = exists
    ? Operation.payment({ destination: dest, asset: Asset.native(), amount })
    : Operation.createAccount({ destination: dest, startingBalance: amount });

  const tx = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(op)
    .setTimeout(60)
    .build();
  tx.sign(escrow);
  const res = await server.submitTransaction(tx);
  console.log(`Enviados ${amount} XLM a ${dest} ✅`);
  console.log(`Tx: https://stellar.expert/explorer/testnet/tx/${res.hash}`);
})().catch((e) => {
  console.error('Error:', e.response?.data?.extras?.result_codes || e.message);
  process.exit(1);
});