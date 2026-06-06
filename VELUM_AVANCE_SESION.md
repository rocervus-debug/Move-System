# VELUM — Bitácora de avance

**Última actualización:** 6 jun 2026
**Para:** Roy
**Qué es esto:** registro completo de lo trabajado en la sesión, qué quedó vivo, y qué depende de ti.

---

## 1. Storefront — rediseño y personalización
- **3 temas** (Pulse oscuro/atlético · Atelier claro/editorial · Lumen cálido/wellness) elegibles por gym.
- **Swatches de acento por tema** (reemplazaron el color libre). El público deriva variantes y contraste solo.
- **Limpieza UX (PIXEL):** botones flotantes 4→1 (arreglada colisión IA/WhatsApp), paquetes al 3er lugar, hero con 1 CTA + ancla "Planes desde $X", quité "Powered by VELUM" del nav, **Coach IA configurable por gym** (prominente/discreto).

## 2. Aura (rebrand del asistente)
- "Coach IA" → **Aura** en todo lo que ve el cliente (storefront, app, privacidad) + system prompts. Se presenta como persona, nunca como "IA".

## 3. App del atleta — coherencia visual
- **Armonía de acento** con el storefront (ajustado para fondo oscuro).
- **Loaders sin flash** (pre-paint del tema cacheado + spinner neutro; app usa acento del gym).
- **Íconos limpios** (reemplacé el de "strength" que parecía enchufe, el rayo de cardio, la caja de cartón de paquetes por SVG line-icons).

## 4. Pricing
- **Max = 0% comisión storefront** (Pro = 2%). Diferenciador vs Nessty.
- **Cap Pro: 100 → 60 atletas** (promedio MX ~50). Consistente en frontend, DB, checkout, tabla y copy.

## 5. Bloque A — Producto core (cerrado)
- **Cap duro de límites por plan:** trigger en DB (altas manuales) + pre-check en checkout del storefront. Ya no es solo frontend.
- **Suscripción vencida:** gracia 3 días → modal bloquea el panel admin pidiendo pago. Storefront y app siguen vivos. Owner exento.

## 6. Bloque B — App del atleta (cerrado)
- **Renovación corregida (bug de dinero):** vence se extiende desde `max(hoy, vence_actual)` (ya no se pierden días) + se registra con el nombre real del cliente (antes podía quedar "invisible").
- **Push automático:** 2 crones diarios (clase de hoy 7am · vencimiento en 3 días 10am) con pg_cron. Probado.
- **Seguridad:** encontré y cerré un hueco que yo mismo introduje (un RPC exponía portal_tokens a anónimos).

## 7. Bloque H — Limpieza de backend legacy (cerrado)
- Borradas (por ti): `move-payment`, `move-register`, `move-stripe-webhook`.
- Neutralizadas + borradas (por ti): `velum-stripe-webhook`, `velum-atleta-checkout`.
- Neutralizada: `velum-stripe-callback` (OAuth viejo) + `stripe-callback.html` → redirect.
- En Stripe: borraste el endpoint legacy `cervusfitness.gymforce.mx` (100% errores). Queda solo el de `stripe-webhook` ✓.

## 8. Bloque D — Facturación CFDI (fase 1)
- Recolección de **datos fiscales del gym** (RFC, razón social, régimen, uso CFDI, CP, email) con formulario en Mi Suscripción + RPC acotado.
- Timbrado (Facturapi) diferido hasta que consigas la cuenta + CSD.

## 9. Bloque E — Onboarding (cerrado v1)
- **Wizard/checklist guiado** en el dashboard: auto-detecta qué falta (logo, paquete, Stripe, storefront, fiscal), muestra progreso, lleva a cada sección. Se auto-oculta al completar.
- **Import CSV de clientes** (botón en Clientes): detecta encabezados, omite duplicados, respeta el límite del plan.

## 10. Bloque F — Emails transaccionales (cableados, gated)
- Edge `velum-email` (Resend, plantillas: welcome, recibo, vencimiento, recuperación).
- **Cableados a los flujos reales:** recibo + welcome en compras, welcome al dueño en signup, vencimiento en el cron (push + email).
- Mientras no haya `RESEND_API_KEY`, hace no-op limpio. **Para activar:** cuenta Resend + dominio verificado + 2 secrets (`RESEND_API_KEY`, `EMAIL_FROM`).

## 11. Bloque G — Hardening Fase B (parcial)
- Revoqué acceso anon/authenticated de 5 funciones SECURITY DEFINER sensibles (TOTP/recovery/rate-limit). Quedan WARNs menores (pg_net, bucket listing).

## 12. Link de pago manual (#25, cerrado)
- `velum-stripe-charge` migrado a Connect nuevo (lee de `gyms`, destination charge, comisión por plan) + el webhook ahora **registra** ese pago.

## 13. Métricas SaaS
- Edge `velum-saas-metrics` (solo superadmin): MRR, ARR, ARPU, gyms de paga, churn. Hoy MRR $0 (los 4 gyms son cortesía/owner). Listo para surfacear cuando entren gyms de paga.

## 14. App nativa (en proceso de publicación)
- **Insight clave:** la nativa ES `atleta.html` envuelto (`build.js` lo copia a `www`). Nunca editar `www` a mano.
- Migrada al flujo de pago nuevo, rebuild limpio, **fix de safe-area** (header no se encima con la barra de estado).
- **Apple Developer:** aprobado ✓ (esperando que App Store Connect habilite — propagación).
- **Google:** D-U-N-S solicitado (para cuenta de Organización, evita el gate de 12 testers).
- Capturas tomadas (con tu perfil de MOVE), ficha de tienda lista, login de revisor: código `MOVE` · socio `#085` · contraseña del portal.
- Docs creados: `VELUM_APP_DEPLOY.md` (runbook), `VELUM_APP_FICHA_TIENDA.md` (ficha).

---

## ⚠️ Pendiente DE TU LADO
1. **Subir push** del import CSV + redirect (`git push`).
2. **Apple:** esperar que App Store Connect habilite → crear app → subir build → submit.
3. **Google:** esperar el D-U-N-S (~5 días) → cuenta Organización → submit.
4. **Resend** (emails): cuenta + dominio + 2 secrets → se encienden solos.
5. **Facturapi** (CFDI fase 2): cuenta + CSD → cableo el timbrado.
6. **Smoke test de renovación** con tarjeta real (suma días + aparece en portal).
7. **Confirmar VAPID keys** en Supabase (sin ellas el push corre pero no entrega).
8. **Rename cuenta maestra** Cervus → VELUM (ajustes de Stripe).

## 🔜 Lo que puedo adelantar yo (sin depender de ti)
- Centro de ayuda / guías para dueños de gym.
- Analítica para el gym (retención, asistencia, ingresos/mes).
- SEO del storefront (sitemap, og-image) + carrito abandonado.
- Surfacear las métricas SaaS en el panel superadmin.

## 📄 Documentos de referencia en el drive
- `VELUM_AUDITORIA_COMERCIALIZACION.md` — audit por 13 áreas + 7 bloqueadores.
- `VELUM_APP_DEPLOY.md` — cómo publicar la app nativa.
- `VELUM_APP_FICHA_TIENDA.md` — textos/metadatos/capturas para las tiendas.
