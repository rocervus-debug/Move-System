# Certificación de cobros con dinero real — checklist ejecutable
**Prerrequisito:** Ola 1 desplegada (funciones corregidas) + limpieza de datos hecha.
**Costo estimado de las pruebas:** ~$50-70 MXN (recuperables: son cobros a tu propio gym).
**Regla:** una prueba solo pasa con las 4 evidencias: (1) Stripe dashboard, (2) fila en DB,
(3) visible en el panel del gym, (4) email recibido. Claude verifica DB/panel; Roy aporta
Stripe dashboard y bandeja de correo.

## Prueba 1 — Storefront (pago único) · el riel ROJO
1. Abrir el storefront de MOVE (`/g/{slug}` de MOVE) → comprar el paquete más barato
   (o crear uno de $10 temporal) con tarjeta real.
2. Evidencias: sesión `paid` en Stripe → fila en `storefront_orders` status paid →
   **fila en `pagos` con el mismo `stripe_session_id`** (esto es lo que falló en mayo) →
   pago visible en el panel de MOVE → email de recibo.
3. PASA si las 5 cosas existen. Verificación SQL la corre Claude.

## Prueba 2 — Link manual (velum-stripe-charge v16)
1. Panel de MOVE → generar link de pago de $10 para "Cliente Prueba" → abrir el link → pagar.
2. Evidencias: sesión en Stripe con metadata source=manual_link → fila en `pagos`
   (vía la rama manual_link del webhook) → visible en panel.
3. EXTRA de seguridad: intentar llamar la función SIN token (curl) → debe dar 401.
   La corre Claude y adjunta el 401.

## Prueba 3 — Domiciliación de atleta (recurrente)
1. Panel de MOVE → generar suscripción mensual de $10 para un cliente de prueba con TU
   email → completar el checkout con tarjeta real.
2. Evidencias: suscripción activa en Stripe → `member_subscriptions` con status active,
   `stripe_subscription_id` y **`cliente_id` poblados** → fila en `pagos` de la 1a
   mensualidad → email de recibo.
3. **Cancelar** desde donde corresponda → status canceled en DB y en Stripe.
4. PASA si el ciclo completo (alta→cobro→cancelación) deja rastro correcto.

## Prueba 4 — SaaS gym→VELUM (el cobro del día 8)
1. `registro.html` con un email nuevo tuyo → completar checkout (tarjeta real, trial 7 días).
2. Verificar: gym creado + login funciona + `subscription_status='trialing'`.
3. Para NO esperar 7 días: en Stripe dashboard → esa suscripción → "End trial now" →
   se genera el invoice → verificar `invoice.payment_succeeded` → gym pasa a `active`.
4. Después: cancelar la suscripción → gym pasa a `canceled`. (Opcional: borrar el gym de
   prueba con Claude al final.)
5. PASA si el ciclo trial→cobro→active→canceled se refleja solo en DB.

## Prueba 5 — Dunning (pago fallido)
1. En Stripe TEST mode (o con la tarjeta 4000 0000 0000 0341 en una domiciliación de
   prueba): provocar un cobro fallido.
2. Evidencias: `member_subscriptions.status='past_due'` (o gym past_due si es SaaS) +
   email `pago_fallido` recibido con link de actualización.
3. PASA si el estado y el aviso ocurren sin intervención.

## Cierre
- Los 5 en verde → actualizar `VELUM_AUDITORIA_COBROS.md` a "CERTIFICADO 100%" con fecha
  y evidencias, tablero a Hecho, y los cobros online se pueden ofrecer a clientes sin
  asterisco. Cualquier prueba en rojo → el hallazgo entra por Flujo 1 como P0 y se
  re-certifica solo ese riel.
