# Guía de implementación para el equipo

> Regla de Andrés: **primero que funcione**. Nada entra si no ayuda a la demo.

## 0. Qué ya está y qué falta

| Parte | Estado |
|---|---|
| Backend (API, pedidos, escrow Stellar, reembolsos, métricas) | ✅ Hecho y probado en modo simulado |
| Integración Pollar (login + pago) | ⬜ Falta |
| App (pantallas de comprador y Runner) | ⬜ Falta |
| Presentación interactiva | ⬜ Falta |
| Deploy con URL pública | ⬜ Falta |

Todo vive en **una sola página web**: arriba la presentación, abajo (o en `/app`) la app funcionando.

---

## 1. Reparto (asignen un nombre a cada bloque)

| Bloque | Responsable | Entrega |
|---|---|---|
| **A. Backend + Stellar + Deploy** | ______ | API corriendo en una URL pública con escrow en testnet |
| **B. Pollar** | ______ | Login con Pollar y pago a la escrow que regresa un `txHash` |
| **C. App (UI)** | ______ | 4 pantallas conectadas a la API |
| **D. Presentación** | ______ | Pitch interactivo + métricas en vivo |

B y C trabajan pegados: C hace las pantallas con pagos simulados y B enchufa Pollar después.

---

## 2. Setup (todos, 10 min)

```bash
# Requisitos: Node 20+, git
git clone <repo> && cd auracafe-backend
npm install
cp .env.example .env
```
Para trabajar sin Stellar mientras tanto, en `.env`:
```
SIMULATE_PAYMENTS=true
```
```bash
npm run dev            # http://localhost:3000/api/config  → debe responder JSON
```
Solo **una persona (A)** crea la escrow real y comparte el secret **por privado** (nunca en el repo ni en el grupo):
```bash
npm run setup:escrow
```

**Git:** `main` siempre funciona. Cada quien en su rama (`front/app`, `front/pollar`, `pitch`) y PR corto.

---

## 3. Bloque A — Backend, Stellar y deploy

1. `npm run setup:escrow` → pegar `ESCROW_SECRET` en `.env`, `SIMULATE_PAYMENTS=false`.
2. Cambiar el menú semilla en `src/db.js` por precios reales (borrar `data.db` para que se regenere).
3. Ajustar en `.env`: `DELIVERY_FEE_MXN`, `PLATFORM_FEE_MXN`, `MXN_PER_UNIT`.
4. Deploy en **Render** (o Railway):
   - New Web Service → repo → Build: `npm install` → Start: `npm start`
   - Variables de entorno = las del `.env`
   - Agregar un disco persistente y `DB_PATH=/data/data.db` (si no, la base se borra en cada deploy)
5. Pasarle la URL (`https://....onrender.com`) a todo el equipo.

✅ **Listo cuando:** `GET https://<url>/api/config` regresa la `escrowAddress` real.

---

## 4. Bloque B — Pollar

Pollar va **solo en el front**. El backend no lo importa: solo recibe la dirección de la wallet y el hash del pago.

1. Crear app en el dashboard de Pollar → sacar la API key pública de testnet (`pk_...`).
2. Instalar: `npm install @pollar/react @pollar/core`
3. Envolver la app en `<PollarProvider>` y usar `usePollar()` para login (Google / email).
4. **Spike de 30 min (lo primero que hacen):** confirmar en `docs/` del repo de Pollar cómo mandar un pago a una dirección **con memo de texto**. Nuestro backend identifica el pedido por ese memo.
   - Si Pollar **no** permite memo → avisen y cambiamos el backend para identificar el pago por dirección + monto.
5. Usar wallet **embebida / clásica (`G...`)**, no el adaptador de smart wallet `C...`: esos pagos no aparecen como "payment" y el backend no los encuentra.
6. Fondear wallets de prueba en testnet: `npm run fund -- G...`

⚠ Pollar exige **HTTPS** (en `localhost` sí funciona; en el deploy de Render ya viene con HTTPS).

✅ **Listo cuando:** desde la app se hace login, se paga a la escrow y el backend responde `PAID`.

---

## 5. Bloque C — App (4 pantallas)

Sugerencia: **Vite + React** (porque Pollar tiene bindings de React). `npm run build` y copiar `dist/` a `public/` del backend → todo sale en una sola URL.

| Pantalla | Llamadas a la API |
|---|---|
| **1. Login** | Pollar login → `POST /api/users {name, stellarAddress}` → guardar `user.id` |
| **2. Pedir** | `GET /api/menu` → carrito (un solo local) → `POST /api/orders` → pagar (bloque B) → `POST /api/orders/:id/pay {txHash}` |
| **3. Mis pedidos** | `GET /api/users/:id/orders` cada 3 s → mostrar estado y el **código de 4 dígitos** en grande |
| **4. Modo Runner** | `GET /api/orders` (feed) → Aceptar → "Ya lo compré" → capturar código → `deliver` → mostrar link al explorer |

Cliente mínimo para copiar:
```js
const API = '/api'; // o la URL de Render
async function api(path, body) {
  const r = await fetch(API + path, body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : undefined);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error);
  return data;
}

// Flujo comprador
const user  = await api('/users', { name, stellarAddress });
const order = await api('/orders', { buyerId: user.id, items: [{ menuItemId: 2, qty: 1 }], deliverTo: 'J-201' });
// order.payment.escrowAddress, order.payment.memo, order.pricing.totalAsset → a Pollar
const txHash = await pagarConPollar(order);           // bloque B
await api(`/orders/${order.id}/pay`, { txHash });

// Flujo Runner
await api(`/orders/${id}/accept`,  { runnerId });
await api(`/orders/${id}/pickup`,  { runnerId });
await api(`/orders/${id}/deliver`, { runnerId, code });
```
Link al explorer para el "wow" de la demo:
`https://stellar.expert/explorer/testnet/tx/<payoutTx>`

Los errores de la API vienen como `{ error: "mensaje" }` en español: muéstrenlos tal cual en un toast.

✅ **Listo cuando:** dos celulares (comprador y Runner) completan un pedido de punta a punta.

---

## 6. Bloque D — Presentación interactiva

Secciones de la página, en este orden:
1. **Problema:** filas de 25 min vs. 10 min entre clases.
2. **Solución:** pides → un alumno con hueco lo lleva a tu salón → pago asegurado.
3. **Cómo funciona:** diagrama del flujo del dinero (está en el README).
4. **Modelo de negocio:** Runner gana el envío ($15), plataforma gana comisión ($3). Números en vivo con `GET /api/stats`.
5. **Por qué Stellar / Pollar:** liquidación en segundos, comisión casi cero, el alumno no ve nada de cripto (login con Google).
6. **Demo en vivo** → botón que lleva a la app.

✅ **Listo cuando:** se puede presentar de corrido en 5 min con la demo incluida.

---

## 7. Orden de trabajo

1. **Fase 1:** setup de todos · A hace deploy · B hace el spike del memo · C arma pantallas en modo simulado · D escribe el guion.
2. **Fase 2:** B + C conectan Pollar al flujo real en testnet.
3. **Fase 3:** ensayo completo con dos celulares, en la red de la Facultad.

---

## 8. Checklist del día de la demo

- [ ] Escrow con saldo en testnet
- [ ] Dos wallets de prueba fondeadas (comprador y Runner) y ya logueadas
- [ ] Un pedido ya **entregado** antes de empezar (para que `/stats` no salga en ceros)
- [ ] **Plan B:** segundo deploy con `SIMULATE_PAYMENTS=true` por si falla la red
- [ ] Datos móviles como respaldo del wifi
- [ ] Nombre nuevo del proyecto cambiado en `APP_NAME` y en la presentación
