import { PollarClient } from "https://esm.sh/@pollar/core";

window.pollarClient = new PollarClient({
  apiKey: "TU_CLAVE",
  network: "testnet"
});


window.pagarConPollar = async function(order) {

  console.log("Pago con Pollar iniciado", order);

  const result = await window.pollarClient.sendPayment({
    destination: order.payment.escrowAddress,
    amount: order.pricing.totalAsset.toString(),
    asset: {
      type: "native"
    }
  });

  console.log(result);

  return result.hash;
};