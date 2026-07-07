# Auditoría del sistema de cobros — ¿listo para comercializar?
**Fecha:** 2026-07-07 · **Método:** código desplegado de las 9 funciones de dinero + cruces
de integridad en producción + logs. CAUDAL + CENTINELA.

## Veredicto global: NO está al 100%. Está al ~70%, con 2 bloqueadores y 1 verdad incómoda.

**La verdad incómoda:** el 100% de los pagos de los últimos 90 días (443 pagos, $375k MXN)
son capturas MANUALES del panel. Los rieles de Stripe casi no han procesado dinero real:
3 órdenes de storefront en mayo-junio (con bug), 2 domiciliaciones que nunca completaron,
y cero gyms que hayan pagado a VELUM. **El código actual se ve sólido, pero un sistema de
cobros no se certifica leyéndolo: se certifica con dinero de verdad cruzando cada riel.**

## Semáforo por riel

| Riel | Estado | Evidencia |
|---|---|---|
| 1. SaaS gym→VELUM (registro→trial→cobro d8) | AMARILLO | Registro→gym creado funcionó en vivo (7-jun). El COBRO del día 8 jamás ha ejecutado. Webhook v15 maneja succeeded/failed/canceled correcto en código. |
| 2. Storefront (pago único de atleta) | ROJO | Las 3 órdenes pagadas reales (may-jun, 1 en LIVE) crearon al cliente pero NUNCA registraron el pago en `pagos` — el gym cobró y sus libros no lo vieron. El webhook fue reescrito después (v13-v15) y el camino nuevo NUNCA se ha probado con una venta real. |
| 3. Domiciliación de atletas | AMARILLO | 2 suscripciones, ambas `incomplete` huérfanas (sin cliente_id, sin sub_id). Nunca completó un ciclo. + P1s de código abajo. |
| 4. Links manuales del panel (velum-stripe-charge) | ROJO — P0 | Ver bloqueadores. |
| 5. Cancelaciones / portal / balance / Connect | VERDE claro | Auth y scoping correctos; P2s menores. `velum-stripe-balance` es la mejor de todas. |
| 6. Renovación desde la app del atleta | AMARILLO | Usa el riel 2/3 (checkout-create con return_to) — hereda su estado. |

## Bloqueadores P0 (no vender hasta matarlos)

1. **`velum-stripe-charge` SIN autenticación.** El `gym_id` viene del body y no verifica JWT:
   cualquiera en internet puede generar links de cobro a nombre de cualquier gym. Cross-tenant
   en un endpoint de dinero. (Las otras funciones sí verifican firma.)
2. **`velum-stripe-charge` cobra 1.5% de fee hardcodeado** — ignora `ZERO_FEE_PLANS` y
   contradice la comisión 0% que la web promete. Cada cobro manual le quitaría dinero a un
   gym Max al que se le vendió 0%.

## P1 (arreglar antes de la primera venta real, o en la misma semana)

3. Cobros manuales no atribuibles: sin `metadata[gym_id]`, sin registro en DB, y el evento
   cae en la cuenta conectada (no llega al webhook actual) → "cobrado en Stripe, invisible
   en el panel". El mismo patrón que ya pasó con las 3 órdenes de mayo.
4. `velum-member-subscription`: crea filas `incomplete` huérfanas sin idempotencia ni
   error-check (las 2 de producción son eso).
5. `cliente_id` nunca poblado al crear la suscripción → la cancelación por el portal del
   atleta responde 403 siempre (verificar si el webhook lo rellena al activar).
6. `velum-saas-setup` sin auth real (el comentario dice que la tiene) — puede crear
   productos/precios en el Stripe de VELUM.
7. Transversal: el `verifyJWT` de 4 funciones de dinero NO valida `exp` — un token viejo
   sirve para siempre. Solo `velum-stripe-balance` lo valida.

## P2 (deuda menor)

- `monto*100` sin `Math.round` en charge/setup (decimales truenan en Stripe) · expiración
  24h vs 30min inconsistente · `return_url` del portal usa Origin (falla desde Capacitor) ·
  cuentas Connect huérfanas si el update a gyms falla · `business_type` hardcodeado ·
  las 7 funciones auditadas usan `deno.land/std` (regla del repo: Deno.serve nativo; migrar
  al próximo redeploy de cada una) · gym cortesía con `subscription_plan` NULL pagaría 2%.

## Lo que SÍ está sano (verificado)

Firma HMAC del webhook con anti-replay ✓ (401 real) · idempotencia por `stripe_session_id`
sin un solo duplicado en producción ✓ · plan Max con `stripe_price_id` válido ✓ · secretos
operativos en runtime ✓ · cero errores en logs de funciones de dinero (24h) ✓ · registro
self-serve creó gym real en vivo ✓.

## Plan de certificación (para llegar al 100% real)

**Fase A — Matar P0s y P1s de código** (FORJA/CAUDAL, con gates + deploys con OK de Roy):
auth + fee 0% + metadata/registro en `velum-stripe-charge` · idempotencia y cliente_id en
`velum-member-subscription` · candado en `velum-saas-setup` · `exp` en el verifyJWT
compartido · limpiar las 2 filas incomplete y las 3 órdenes sin pago (conciliación manual).

**Fase B — Certificación con dinero real** (Roy con tarjeta propia, ~$50 MXN de pruebas;
cada prueba con checklist de evidencia: Stripe dashboard + fila en DB + panel del gym + email):
1. Storefront: comprar un paquete de $10 en MOVE → verificar pago en `pagos` + recibo.
2. Domiciliación: suscribir un atleta de prueba → verificar activa + pago + **cancelarla**.
3. SaaS: registro de gym de prueba con trial → **esperar/forzar el cobro del día 8** (o
   trial de 1 día en modo prueba) → verificar active + acceso · luego cancelar.
4. Link manual: generar un link desde el panel → pagar → verificar atribución.
5. Dunning: simular pago fallido (tarjeta 4000...0341) → verificar past_due + email.

**Criterio de "100% comercializable":** los 5 caminos de la Fase B en verde con evidencia,
cero P0/P1 abiertos. Hasta entonces, se puede vender siendo honestos: captura manual de
pagos funciona perfecto hoy (es lo que Krajo usa a diario); los cobros online se activan
por gym cuando estén certificados.
