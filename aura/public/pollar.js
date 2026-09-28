// ===== Pollar (Stellar) =====
// Docs reales del SDK: https://docs.pollar.xyz/docs/sdk-reference/pollar-core
// OJO: la versión anterior de este archivo usaba `network` (no existe, es
// `stellarNetwork`), `createSmartWallet()` y `sendPayment()` — ninguno de
// los dos últimos existe en @pollar/core. Por eso nunca conectaba.
//
// Además, GUIA-EQUIPO.md pide explícitamente NO usar el login de "Smart
// Wallet" (passkey, dirección C...): esos pagos no aparecen como "payment"
// en Horizon y src/stellar.js (verifyPayment) no los encuentra. Aquí se usa
// el login normal (Google) que crea una wallet clásica G... embebida.
import { PollarClient } from "https://esm.sh/@pollar/core@0.11.3";

// Debe ser el mismo valor que POLLAR_PUBLISHABLE_KEY en tu .env (es una
// clave pública, está bien que viva en el front).
const POLLAR_PUBLISHABLE_KEY = "pub_testnet_6b1814e24b4b9364febd8fd843256b1d";

window.pollarClient = new PollarClient({
  apiKey: POLLAR_PUBLISHABLE_KEY,
  stellarNetwork: "testnet",
});

console.log("Pollar listo", window.pollarClient);

// ===== Conectar / crear wallet =====
// Abre el login de Pollar (Google) y resuelve con la dirección Stellar (G...)
// en cuanto el usuario queda autenticado. El alumno nunca ve la wallet:
// Pollar la crea sola la primera vez que entra.
window.conectarWalletPollar = function (provider = "google") {
  const pollar = window.pollarClient;
  return new Promise((resolve, reject) => {
    // onAuthStateChange llama al callback DE INMEDIATO con el estado actual
    // (por ejemplo si ya había una sesión guardada). Por eso no podemos usar
    // "unsubscribe()" dentro del propio callback si aún no terminó de
    // asignarse — usamos una bandera + una variable que se llena después.
    let settled = false;
    let unsub = null;

    function finish(run) {
      if (settled) return;
      settled = true;
      if (unsub) unsub();
      run();
    }

    unsub = pollar.onAuthStateChange((state) => {
      console.log("[pollar] auth state:", state.step, state);

      if (state.step === "authenticated") {
        const address =
          state.session?.wallet?.address ||
          state.session?.address ||
          state.wallet?.address;

        finish(() => {
          if (!address) {
            reject(new Error("Wallet conectada pero no se encontró la dirección Stellar (revisa la consola: state.session)."));
          } else {
            resolve(address);
          }
        });
        return;
      }

      if (state.step === "error") {
        finish(() => reject(new Error(state.message || "No se pudo conectar la wallet Pollar")));
        return;
      }

      if (state.step === "wallet_not_installed") {
        finish(() => reject(new Error("Esa wallet no está instalada en este navegador")));
      }
    });

    if (settled) {
      // Ya había una sesión de Pollar guardada: no hace falta abrir el login otra vez.
      if (unsub) unsub();
      return;
    }

    pollar.login({ provider });
  });
};

// ===== Pagar el pedido a la escrow =====
// order viene de POST /orders: usa order.payment.escrowAddress,
// order.payment.memo y order.pricing.totalAsset (ver aura/README.md).
window.pagarConPollar = async function (order) {
  console.log("ORDEN COMPLETA", order);
  console.log("DESTINO ESCROW", order.payment.escrowAddress);

  try {
    const outcome = await window.pollarClient.runTx("payment", {
      destination: order.payment.escrowAddress,
      amount: order.pricing.totalAsset.toString(),
      asset: { type: "native" },
      memo: order.payment.memo,
    });

    console.log("RESULTADO POLLAR:", outcome);

    if (outcome.status === "error") {
      throw new Error(outcome.details || outcome.resultCode || "Pollar rechazó el pago");
    }

    const hash = outcome.hash || outcome.txHash || outcome.transactionHash || outcome.result?.hash;
    if (!hash) {
      throw new Error('Pollar no devolvió el hash del pago (estado: ' + outcome.status + '). Respuesta: ' + JSON.stringify(outcome).slice(0, 300));
    }
    return hash;
  } catch (error) {
    console.error("ERROR EN POLLAR:", error);
    throw error;
  }
};