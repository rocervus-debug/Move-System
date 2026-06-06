# VELUM — Auditoría de Comercialización

**Fecha:** 6 jun 2026
**Objetivo:** Inventario honesto, por áreas, de lo que separa el producto actual de cobrarle a gyms reales (no MOVE/Krajo owner) de forma confiable y escalable.
**Owner:** Roy Cervus

**Leyenda de estado:** ✅ listo · 🟡 parcial / a validar · 🔴 falta
**Leyenda de prioridad:** 🔴 BLOQUEADOR (antes de cobrar a un gym externo) · 🟠 IMPORTANTE (primeros 30–60 días) · 🟢 NICE-TO-HAVE (diferenciador / después)

> Contexto: VELUM ya tiene Stripe en producción (Connect + Billing), aislamiento cross-gym validado (0 errors), app nativa empaquetada (Capacitor), términos + privacidad + acuerdo de socio comercial, y material de GTM extenso. Esta auditoría se enfoca en los huecos, no en re-listar lo construido.

---

## A. Producto core — gestión del gym (panel interno)

Clientes, paquetes, horarios, check-in QR, reservas, pagos, coaches, programas, comisiones, 2FA, storefront, suscripción SaaS.

- ✅ CRUD completo de clientes, paquetes, horarios, coaches, pagos.
- ✅ Check-in por QR (kiosco con RPC seguro) y reservas.
- ✅ Dashboard de comisiones + panel de suscripción SaaS.
- 🟡 🔴 **Enforcement de límites por plan.** Hoy los planes (Pro 100 clientes / 3 coaches vs Max ilimitado) tienen los límites en la tabla, pero falta verificar que el sistema **bloquee de verdad** al pasarse (crear cliente #101 en Pro, 4º coach, features Max como IA/export). Sin esto, no hay diferencia real entre pagar Pro y Max. **Verificar + implementar gates.**
- 🟡 **Manejo de estado de suscripción vencida/past_due.** Si un gym deja de pagar el SaaS, ¿qué pasa con su panel? Debe haber un modo "solo lectura" / bloqueo suave, no acceso completo gratis.

---

## B. App del atleta (PWA + nativa)

- ✅ Portal, check-in QR, reservas, plan/programa, Aura (asistente), progreso, medidas, renovación con Connect.
- ✅ Estética unificada con el storefront (acento del gym, loaders sin flash, íconos limpios).
- 🟡 🔴 **Validar que la renovación extiende `vence` correctamente.** Es el flujo que mueve dinero del atleta; un bug aquí = cliente paga y no se le activa. Hacer smoke test end-to-end con tarjeta real de monto bajo.
- 🟡 **Push notifications.** Existe `velum-web-push` pero falta validar cobertura (recordatorio de clase, vencimiento próximo, mensaje de Aura) y permisos en iOS PWA.
- 🟠 **Distribución en tiendas** (ver sección M).

---

## C. Storefront — adquisición de clientes del gym

- ✅ Página pública multi-estética (Pulse/Atelier/Lumen) + swatches + Aura.
- ✅ Checkout vía Stripe Connect, 0% comisión en Max.
- ✅ UX pulida (1 CTA, precio visible, botones flotantes reducidos).
- 🟢 **Dominio propio** (Nivel 2 — `tienda.migym.com` vía Vercel/Cloudflare for SaaS). Feature de Max.
- 🟢 **Carrito abandonado (FASE 10F).** Recuperar visitantes que iniciaron checkout y no pagaron (email/WhatsApp).
- 🟡 **SEO básico** por storefront (meta tags dinámicos ya hay; falta sitemap, og-image por gym, indexabilidad).

---

## D. Pagos & Facturación 🔴 (la sección con el bloqueador más grande)

- ✅ Stripe Connect en vivo (pagos del storefront/atleta → cuenta del gym, comisión 2%/0%).
- ✅ Stripe Billing en vivo (suscripción SaaS Pro/Max + Customer Portal).
- 🔴 **BLOQUEADOR — Facturación fiscal mexicana (CFDI 4.0).** En México, un gym que paga $599–$999/mes de SaaS **va a exigir factura** para deducir. Y muchos atletas pedirán factura de su compra. Hoy Stripe cobra pero no emite CFDI. Opciones: integrar Facturapi / Bind ERP / SW Sapien, o un flujo manual al inicio. **Sin esto, vendes solo a quien no factura — techo bajo.**
- 🟡 🔴 **Dunning / reintentos de pago fallido.** Cuando una tarjeta de suscripción falla, Stripe reintenta, pero falta: emails de "tu pago falló", periodo de gracia, y el bloqueo suave al expirar. Hoy un `past_due` probablemente queda sin manejar.
- 🔴 **Política de reembolso / cancelación explícita** y flujo en UI (cancelar suscripción desde el panel — el Customer Portal lo permite, pero documentar reglas).
- 🟡 **Reconciliación de payouts de comisión.** La tabla `commission_payouts` existe; falta el proceso real de cómo y cuándo VELUM cobra/recibe esas comisiones y su conciliación contable.
- 🟡 **Recibos al cliente** (no CFDI, sino el comprobante simple post-compra por email).

---

## E. Onboarding & activación del gym (self-serve)

Clave para vender sin que tú configures cada cuenta a mano.

- ✅ Signup self-serve (`registro.html`) + creación automática de gym vía webhook (validado con cupón).
- 🔴 **Setup wizard / primer arranque.** Tras registrarse, el gym llega a un panel vacío. Falta un asistente guiado: sube tu logo, crea tu primer paquete, conecta Stripe, activa tu storefront. Sin esto, el churn de activación será alto.
- 🟠 **Importación de datos.** Un gym que migra desde Excel/otro sistema necesita subir su lista de clientes y paquetes (CSV import). Es lo primero que pedirá un gym establecido.
- 🟡 **Onboarding de Stripe Connect guiado** dentro del wizard (ya existe la función; falta el hilo conductor).

---

## F. Comunicaciones transaccionales

- 🟡 **Email.** Existen `move-email-reminder` y `velum-lead-notify`, pero falta auditar cobertura: ¿hay welcome al registrarse?, ¿recibo de compra?, ¿recordatorio de vencimiento?, ¿recuperación de contraseña?, ¿bienvenida del atleta tras comprar? **Mapear qué emails existen vs cuáles faltan.**
- 🟡 **WhatsApp.** Hay campos de templates (`whatsapp_template_*`) y referencias; validar si está realmente conectado a la API de WhatsApp Business o solo es enlace `wa.me`.
- 🟡 **Push** (ver B).
- 🟠 **Dominio de envío + reputación.** Para emails transaccionales serios: dominio propio verificado (SPF/DKIM/DMARC) con un proveedor (Resend/Postmark/SendGrid), no envíos genéricos.

---

## G. Seguridad & Compliance

- ✅ Aislamiento cross-gym validado (0 errors, 16 smoke tests pasados).
- ✅ Rate limits, 2FA (TOTP), cookie banner, headers.
- ✅ `VELUM_SECURITY_BACKLOG.md` documentado.
- 🟠 **Hardening Fase B (los ~14 WARN del advisor):** mover `pg_net` fuera de `public`; revocar EXECUTE público de funciones `SECURITY DEFINER` que no deban ser anónimas (`set_totp_enrollment`, `set_recovery_codes`, `consume_recovery_code` — estas NO deberían ser llamables por anon); cerrar listado del bucket `storefront-assets`; políticas de `login_attempts`/`rate_limits`. Ninguno es crítico hoy, pero son deuda antes de escalar.
- 🟠 **LFPDPPP (ley mexicana de datos personales).** Privacidad existe; falta el proceso real de derechos ARCO (acceso/rectificación/cancelación/oposición) y designar responsable de datos.
- 🟡 **Runbook de backup/restore.** Supabase respalda automático, pero falta documentar y *probar* una restauración (¿cuánto tarda, qué se pierde?).

---

## H. Infraestructura & confiabilidad

- ✅ Health check (`move-health-check`), tabla `error_logs`.
- 🔴 **Limpieza de funciones legacy.** Conviven duplicados: `move-payment`/`velum-payment`, `move-stripe-webhook`/`velum-stripe-webhook`/`stripe-webhook`, `velum-stripe-charge`/`velum-stripe-callback`. Riesgo de webhooks huérfanos cobrando o registrando doble. **Auditar cuáles están activos en Stripe y borrar los muertos.**
- 🟠 **Monitoreo & alertas.** Falta alertar cuando un webhook falla, un pago no concilia, o un edge function tira 500. Hoy te enterarías por el cliente.
- 🟠 **Entorno de staging.** Todo se despliega directo a producción. Un staging (branch de Supabase + preview de Vercel) evita romper a gyms en vivo.
- 🟡 **Documentar los errores 500 legacy** que quedaron pendientes.

---

## I. Analítica & métricas

- ✅ Dashboard de comisiones.
- 🟠 **Métricas SaaS de negocio (superadmin):** MRR, gyms activos, churn, conversión trial→pago, ARPU. Es lo que necesitas TÚ para operar VELUM como negocio.
- 🟡 **Analítica para el dueño del gym:** retención de socios, asistencia, ingresos por mes, paquetes más vendidos. Es un argumento de venta fuerte (Nessty lo presume).
- 🟡 **Tracking de producto** (qué features se usan) para priorizar.

---

## J. Soporte & éxito del cliente

- 🟡 Existen `move-pwa-tutorial.html` y `move-portal-features.html`.
- 🟠 **Centro de ayuda / base de conocimiento** para dueños de gym (cómo cobrar, cómo configurar storefront, cómo dar de alta clientes).
- 🟠 **Canal de soporte** (WhatsApp/email/chat) y un compromiso de respuesta. Un gym que no puede cobrar el lunes en la mañana necesita respuesta.
- 🟢 Onboarding 1:1 para los primeros clientes (alto toque al inicio, sistematizar después).

---

## K. Marketing & Go-To-Market

- ✅ Material extenso ya creado: growth plan, playbook 30 días, roadmap 100 clientes, scripts de venta, funnel setup, beta campaign, prospects, contenido, plan de redes.
- ✅ Landing (`index.html`) + guion de video promo.
- 🟠 **Producción del video promo** (el guion está; falta grabarlo/editarlo).
- 🟠 **Ambiente demo** para prospectos (un gym "sandbox" con datos bonitos que puedas mostrar en una llamada).
- 🟢 **Casos de estudio / testimonios** — requieren los primeros clientes; planear capturarlos desde el día 1.

---

## L. Legal & comercial

- ✅ `terminos.html`, `privacidad.html`, `VELUM_ACUERDO_SOCIO_COMERCIAL.md`.
- 🟡 🔴 **Cambiar el nombre de la cuenta maestra** "Cervus Fitness" → "VELUM" (aparece en cargos/descriptores). Pendiente desde antes.
- 🟠 **Política de reembolso/cancelación** publicada (liga con sección D).
- 🟡 **Términos específicos del SaaS** (SLA, uso aceptable, responsabilidad sobre datos de los gyms como encargado del tratamiento).

---

## M. Distribución de la app nativa

- ✅ App empaquetada con Capacitor (`velum-app/`).
- 🟠 **Submission a App Store / Play Store:** cuentas de desarrollador, fichas de tienda (capturas, descripción, ícono), revisión de Apple/Google, política de privacidad enlazada. Proceso de semanas — empezar pronto si lo quieres nativo.
- ✅ PWA instalable ya funciona como puente mientras tanto.

---

## Top bloqueadores (lo que NO puede faltar antes de cobrarle a un gym externo)

1. **Facturación CFDI (México)** — sin esto, el mercado deducible queda fuera. *(Sección D)*
2. **Enforcement real de límites por plan** — para que Pro vs Max signifique algo. *(Sección A)*
3. **Manejo de pago fallido / suscripción vencida** (dunning + bloqueo suave). *(Secciones A, D)*
4. **Limpieza de funciones/webhooks legacy** — riesgo de cobro/registro doble. *(Sección H)*
5. **Cobertura de emails transaccionales** (welcome, recibo, vencimiento, recuperación). *(Sección F)*
6. **Validar end-to-end la renovación del atleta** con dinero real. *(Sección B)*
7. **Rename cuenta maestra → VELUM.** *(Sección L)*

## Secuencia sugerida (90 días)

**Semanas 1–3 (cobrar sin sustos):** CFDI + dunning + límites por plan + limpieza de webhooks legacy + rename cuenta + smoke test renovación.

**Semanas 4–7 (activación self-serve):** setup wizard + import CSV + auditoría/cierre de emails transaccionales + métricas SaaS para ti.

**Semanas 8–12 (escala y pulido):** Hardening Fase B + monitoreo/alertas + staging + centro de ayuda + producción de video + submission a tiendas.

**Continuo / diferenciadores:** dominio propio, carrito abandonado, analítica para el gym, app theme Nivel 2.
