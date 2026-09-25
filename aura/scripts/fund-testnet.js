// Fondea cualquier wallet (ej. la de Pollar de un compañero) en testnet: npm run fund -- G...
const addr = process.argv[2];
if (!addr) { console.error('Uso: npm run fund -- <G...>'); process.exit(1); }
fetch(`https://friendbot.stellar.org?addr=${addr}`)
  .then((r) => console.log(r.ok ? `Fondeada ✅ ${addr}` : `Friendbot: ${r.status} (¿ya estaba fondeada?)`))
  .catch((e) => console.error(e.message));
