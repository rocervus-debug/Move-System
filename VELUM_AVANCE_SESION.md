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

## 15. Analítica para el gym (nuevo)
- Tarjeta **"Analítica de tu negocio"** en el dashboard del dueño, calculada en memoria desde los pagos reales (sin queries nuevas).
- Muestra: ingresos del mes, ticket promedio, **retención** (activos vs vencidos), **ingresos de los últimos 6 meses** (mini-gráfica de barras) y **planes más vendidos**.
- Defensiva: si no hay datos o algo falla, se oculta sola. Se refresca al cargar pagos.

## 16. Centro de ayuda para dueños (nuevo)
- Item **"Centro de ayuda"** en el sidebar → abre un modal buscable con **15 guías** agrupadas (Primeros pasos, Clientes y cobros, Tu marca, Operación, Cuenta y facturación).
- Cubre: configurar el gym, alta de clientes + import CSV, registrar pagos/renovaciones, cobrar en línea con Stripe, página pública, paquetes, Aura, check-in/QR, horario, la app del atleta, datos fiscales, límites de plan y la lógica de bloqueo por falta de pago.
- Acordeón colapsable + buscador + contacto de soporte por WhatsApp. Reduce tu soporte 1:1 cuando entren gyms.

## 17. Fix: borrar planes del catálogo (RLS)
- **Síntoma:** "error al borrar un plan" en el catálogo de planes (cualquier gym).
- **Causa raíz:** el borrado es un *soft delete* (`is_active=false`), pero la política de SELECT de `packages` exigía `is_active=true`. Postgres evaluaba esa condición sobre la fila resultante del UPDATE → la fila "desaparecía" → rechazaba con "new row violates row-level security policy". No era el cruce de gym ni el rol.
- **Fix (solo base de datos, ya en vivo):** nueva política de SELECT `packages_auth_select_own_gym` que deja al personal autenticado ver los paquetes de **su** gym (activos o archivados). El storefront/anon sigue viendo solo los activos. Verificado en MOVE y Krajo. No requiere push.
- **Auditoría del mismo patrón en toda la base:** barrí todas las políticas de SELECT con banderas (`is_active/is_enabled/is_public/estado/...`). Solo `packages` era vulnerable. `gym_storefront` (apagar storefront) y `storefront_listings` (ocultar paquete) están a salvo porque tienen una política `ALL` por gym que no depende de la bandera (verificado apagando ambas sin error). No quedan cabos sueltos de este tipo.

## 18. Modo claro retirado
- El modo claro estaba a medias: redefinía solo unas variables, pero los miles de estilos en línea con colores fijos (pensados para fondo oscuro) no reaccionaban → botones invisibles y UI rota.
- Decisión: **quitarlo** (el panel es dark-first, igual que storefront y app). Arreglarlo bien implicaba reescribir miles de estilos.
- Hecho: quitados los 3 botones (sidebar, barra superior, Configuración), `toggleColorMode` es no-op, y al cargar se fuerza oscuro + se limpia la preferencia guardada. El CSS de `light-mode` queda inerte (sin uso). Reversible.

## 19. Barrido de calidad multi-gym (RLS)
- Audité todas las tablas con RLS y probé CRUD con claims de un **admin real de Krajo** (no superadmin) contra los 4 gyms, en transacciones revertidas.
- Resultado: aislamiento correcto en todas las tablas centrales (clientes, pagos, coaches, evaluaciones, gastos, horarios, gym_config, gyms): escribe en su gym, **bloqueado** en otros. Sin fugas ni bloqueos. El único bug del patrón packages ya estaba arreglado.

## 20. Métricas SaaS en el panel Super Admin
- Tarjeta nueva **"Métricas del Negocio (VELUM SaaS)"** en Super Admin: MRR, ARR, ARPU, gyms de paga vs cortesía, churn, nuevos del mes y desglose por plan.
- Lee la edge `velum-saas-metrics` con tu JWT de superadmin; el churn se calcula en el cliente. Hoy MRR $0 (gyms de cortesía), listo para cuando entre el primero.

## 21. SEO del storefront
- **Meta tags dinámicos por gym**: title, description, theme-color, canonical y favicon (logo del gym).
- **Open Graph + Twitter Card**: og:image (logo/hero), título y descripción → se ve bien al compartir el link en WhatsApp/Instagram.
- **Datos estructurados (Schema.org HealthClub)**: nombre, dirección, geo, redes y rating → Google puede mostrar rich results.
- **Sitemap dinámico** (`/sitemap.xml` → edge `storefront-sitemap`): lista todos los storefronts activos + páginas estáticas, se actualiza solo.
- **robots.txt**: permite indexar lo público, bloquea /app /portal /checkin etc., y declara el sitemap.

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
