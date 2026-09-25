# AuraCafe — Backend MVP (nombre provisional)

Node + Express + SQLite + Stellar. El front (presentación + app) va en `/public` y lo sirve el mismo servidor.

## Arrancar
```bash
npm install
cp .env.example .env
npm run setup:escrow        # crea escrow en testnet → pega ESCROW_SECRET en .env
npm run dev                 # http://localhost:3000
```
Plan B para la presentación (sin red): `SIMULATE_PAYMENTS=true`.
Fondear la wallet Pollar de alguien en testnet: `npm run fund -- G...`

## Flujo del dinero
```
Alumno (wallet Pollar) ──paga total + memo──▶ ESCROW ──al dar el código──▶ Runner (producto + envío)
                                               └── se queda la comisión (modelo de negocio)
Cancelación antes de que lo tome un Runner ──▶ reembolso automático al que pagó
```

## Estados
`PENDING_PAYMENT → PAID → ACCEPTED → PICKED_UP → DELIVERED`
`PENDING_PAYMENT → CANCELLED` · `PAID → REFUNDED`

## API (`/api`)
| Método | Ruta | Body | Qué hace |
|---|---|---|---|
| GET | `/config` | – | escrow, asset, red, fees (el front lo necesita para pagar) |
| GET | `/menu` | – | menú agrupado por local |
| POST | `/auth/register` | `{name, email, password}` | crear cuenta |
| POST | `/auth/login` | `{email, password}` | iniciar sesión |
| PUT | `/users/:id/wallet` | `{stellarAddress}` | ligar wallet Pollar (el Runner la necesita para cobrar) |
| GET | `/users/:id/orders` | – | mis pedidos (como comprador incluye `deliveryCode`) + ganancias de Runner |
| POST | `/orders` | `{buyerId, items:[{menuItemId,qty}], deliverTo, notes?}` | crea pedido → `totalAsset`, `escrowAddress`, `memo` |
| POST | `/orders/:id/pay` | `{txHash}` | verifica el pago en Horizon → `PAID` |
| GET | `/orders?status=PAID` | – | feed de Runners |
| POST | `/orders/:id/accept` | `{runnerId}` | el Runner lo toma (atómico, solo uno gana) |
| POST | `/orders/:id/pickup` | `{runnerId}` | ya lo compró, va en camino |
| POST | `/orders/:id/deliver` | `{runnerId, code}` | código correcto → paga al Runner en Stellar |
| POST | `/orders/:id/cancel` | `{buyerId}` | cancela / reembolsa |
| GET | `/stats` | – | métricas en vivo para la slide de tracción |

## Pago desde el front con Pollar
1. `POST /orders` → recibes `payment.escrowAddress`, `payment.memo`, `pricing.totalAsset`.
2. Con el SDK de Pollar mandas un pago a `escrowAddress` por `totalAsset`, **memo de texto = `memo`**.
3. Con el hash que te regresa: `POST /orders/:id/pay {txHash}`.

## Límites conocidos del MVP (a propósito)
- Sin auth real: se confía en el `id` que manda el front. La protección del dinero es el código de entrega.
- Si el comprador no da el código, no hay disputa automática.
- Precio MXN → asset con tipo de cambio fijo (`MXN_PER_UNIT`).
- Con USDC la escrow y el Runner necesitan trustline.
