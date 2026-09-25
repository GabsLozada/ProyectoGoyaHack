# Aura — versión corregida

## Cómo abrirla
La forma recomendada es usar **Live Server** en VS Code:

1. Abre esta carpeta en VS Code.
2. Clic derecho sobre `index.html`.
3. Elige **Open with Live Server**.
4. Empieza siempre en `index.html`.

Esto hace que todas las páginas compartan correctamente la misma sesión y los mismos pedidos.

## Flujo para probar
1. `index.html` → Crear cuenta.
2. En `auth.html`, crea una cuenta con cualquier correo (Gmail, Outlook, Yahoo, UNAM, etc.).
3. En `dashboard.html`, entra a **Realizar un pedido**.
4. Confirma el pedido. Verás un **código de entrega de 4 dígitos**.
5. Regresa a **Mi cuenta** y entra a **Ser Runner**.
6. El pedido aparecerá en **Disponibles**.
7. Acepta el pedido: pasa a **Mis recorridos**.
8. Escribe el código que ve el comprador y confirma la entrega.
9. El pedido cambia a **Entregado**.

## Cambios de esta versión
- Se conservó la sección **Objetivo** con el tamaño/proporción original del archivo base.
- Iniciar sesión y Crear cuenta están separados.
- Se acepta cualquier dominio de correo.
- El comprador recibe y ve el código de entrega.
- El Runner ve el mismo pedido, puede aceptarlo y confirmar la entrega con el código.
- El seguimiento no salta a entregado: el indicador se mantiene en movimiento hasta la confirmación.
- Se conserva el efecto de luz del cursor.
