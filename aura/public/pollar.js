import { PollarClient } from "https://esm.sh/@pollar/core";

window.pollarClient = new PollarClient({
  apiKey: "pub_testnet_6b1814e24b4b9364febd8fd843256b1d",
  network: "testnet"
});

console.log("Pollar listo", window.pollarClient);


window.pagarConPollar = async function(order) {

  console.log("ORDEN COMPLETA", order);
  console.log("DESTINO ESCROW", order.payment.escrowAddress);

  try {

    const result = await window.pollarClient.sendPayment({
      destination: order.payment.escrowAddress,
      amount: order.pricing.totalAsset.toString(),
      asset: {
        type: "native"
      }
    });

    console.log("RESULTADO POLLAR:", result);

    return result.hash;

  } catch (error) {

    console.error("ERROR EN POLLAR:", error);

    throw error;
  }
};