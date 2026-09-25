/* ===== Integración Pollar (bloque B de la guía) =====
   Mientras esto esté vacío:
   - con SIMULATE_PAYMENTS=true en el backend, los pagos se simulan;
   - si no, el seguimiento del pedido muestra un campo para pegar el txHash.

   Cuando tengan el SDK funcionando, definan esta función. Debe:
   1. Mandar `order.pricing.totalAsset` (en `order.pricing.asset`) a `order.payment.escrowAddress`
   2. Con MEMO de texto = `order.payment.memo`   ← obligatorio, así el backend encuentra el pedido
   3. Regresar el hash de la transacción (string)

window.pagarConPollar = async function (order) {
  // const tx = await pollarClient.<enviar pago>({ ... });
  // return tx.hash;
};

   Y al hacer login con Pollar, liguen la wallet a la cuenta (el Runner la necesita para cobrar):

   await fetch(`${API_BASE}/users/${getUser().id}/wallet`, {
     method: 'PUT', headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ stellarAddress: 'G...' })
   });
*/
