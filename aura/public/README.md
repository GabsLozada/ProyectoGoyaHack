# Aura — front

Este front ya **no guarda pedidos en el navegador**: todo pasa por el backend (`/api`).

## Cómo correrlo
Opción A (recomendada): el backend lo sirve.
```bash
# en la carpeta del backend
SIMULATE_PAYMENTS=true npm run dev     # abre http://localhost:3000
```
Opción B: Live Server en VS Code (puerto 5500) con el backend corriendo en `localhost:3000`. El front lo detecta solo.

## Flujo para probar (dos navegadores o uno normal + uno incógnito)
1. Crea la cuenta A (comprador) y la cuenta B (Runner).
2. A: Realizar un pedido → confirma → ve su **código de 4 dígitos** (también en Mi cuenta).
3. B: Ser Runner → **Aceptar** → "Ya lo compré" → escribe el código de A → **Confirmar entrega**.
4. A ve el pedido como **Entregado** y puede hacer otro cuando quiera (incluso con uno activo).

## Archivos
- `app.js` — toda la lógica, conectada a la API
- `pollar.js` — aquí va la integración de Pollar (instrucciones dentro)
- `runner.html` — panel del Runner
- `assets/logo.svg`, `assets/objetivo-*.svg` — logo e ilustraciones nuevas
