// Crea la cuenta escrow en testnet y la fondea con Friendbot.
const { Keypair } = require('@stellar/stellar-sdk');

(async () => {
  const kp = Keypair.random();
  const r = await fetch(`https://friendbot.stellar.org?addr=${kp.publicKey()}`);
  if (!r.ok) throw new Error(`Friendbot falló: ${r.status}`);
  console.log('Escrow creada y fondeada en testnet ✅\n');
  console.log(`Pública : ${kp.publicKey()}`);
  console.log(`Pégalo en .env →  ESCROW_SECRET=${kp.secret()}\n`);
  console.log('⚠  Nunca subas el secret a GitHub.');
})().catch((e) => { console.error(e.message); process.exit(1); });
