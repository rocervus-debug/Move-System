# VELUM — Auditoría Maestra de Comercialización

**Fecha:** 7 jun 2026 · **Para:** Roy · **Estado general:** 🟡 Producto sólido, faltan piezas para vender en automático.

**Cómo leer esto:** cada área tiene su estado (🟢 listo · 🟡 falta pulir · 🔴 bloqueador), qué falta para comercializar, y prioridad (**P0** = bloquea la venta · **P1** = importante pronto · **P2** = mejora). Este documento es además la base de conocimiento del equipo de agentes VELUM Studio.

---

## 0. Resumen ejecutivo

**Dónde estás:** el producto funciona de punta a punta — un gym puede cobrar en línea, gestionar clientes, dar de alta pagos, tener su página pública y su app del atleta. La seguridad multi-gym está auditada y sólida. Hay 4 gyms usándolo (MOVE, FRWD, Origin, Krajo), todos de cortesía → **MRR actual: $0**.

**Lo que REALMENTE falta para empezar a vender (los 5 candados P0):**

1. 🔴 **Funnel de adquisición self-serve de gyms** — que un gym nuevo pueda registrarse, elegir plan y **pagar su suscripción a VELUM solo**, sin que tú lo crees a mano. Es lo que convierte el producto en negocio.
2. 🔴 **Emails activados (Resend)** — recibos y avisos de vencimiento están cableados pero apagados. Sin esto, el cliente no recibe nada por correo.
3. 🔴 **App publicada** — Apple procesando el pago de membresía; Google esperando D-U-N-S. Sin la app en tiendas, falta media propuesta de valor.
4. 🔴 **Facturación CFDI (Facturapi)** — un gym mexicano necesita facturar. Hoy se recolectan datos fiscales pero no se timbra.
5. 🟡 **Pricing público + claridad de oferta en el landing** — para que un prospecto entienda qué cuesta y se convenza solo.

**Quick-wins que puedes adelantar sin bloqueadores externos:** noindex de páginas mockup, feature graphic de Google Play, endurecer 2-3 avisos de seguridad menores, página de pricing, secuencia de onboarding por email.

---

## 1. Landing & Web pública — 🟡

**Estado:** `index.html` (1,591 líneas) es un landing serio. Storefront con SEO recién agregado (meta/OG/JSON-LD/sitemap/robots). Páginas legales (privacidad, términos) publicadas.

**Qué falta para comercializar:**
- 🔴 **P0 — Pricing claro y CTA de registro.** El landing debe decir cuánto cuesta (Pro/Max), qué incluye cada plan, y tener un botón "Empieza gratis / Prueba 14 días" que lleve al funnel de signup. Sin precio visible, el prospecto se va.
- 🟡 **P1 — Prueba social.** Testimonios reales de los 4 gyms actuales (logos, una frase, resultados). Aunque sean de cortesía, dan credibilidad.
- 🟡 **P1 — Demo / tour.** Un video corto o GIF del sistema en acción, o un "ver demo" con datos ficticios.
- 🟡 **P2 — Limpieza de páginas mockup.** Hay ~9 archivos `*_MOCKUP.html`, `velum-mockup.html`, `move-portal-features.html` accesibles públicamente. Deben ir a `noindex` o quitarse del deploy (no deben salir en Google ni confundir).
- 🟢 SEO técnico del storefront: hecho.

---

## 2. Sistema interno (panel del gym / producto) — 🟢

**Estado:** maduro. ~22k líneas. Dashboard, clientes (con import CSV), pagos/renovaciones, calendario de vencimientos, coaches, evaluaciones, programa de entreno, asistencia/check-in, horario, gastos/balance, CRM/leads, storefront config, analítica del negocio, centro de ayuda (15 guías), onboarding wizard, métricas SaaS (Super Admin).

**Qué falta para comercializar:**
- 🟡 **P1 — Self-serve onboarding de un gym nuevo.** Hoy el alta de gym es manual (cortesía). Para vender, el flujo "creo mi cuenta → configuro mi gym → pago" debe ser autónomo. (Ligado al funnel del punto 0.)
- 🟡 **P2 — Notificaciones internas / centro de avisos** para el dueño (vencimientos, nuevos leads) ya existe parcialmente; revisar que sea robusto.
- 🟢 Límites por plan (Pro 60), bloqueo por mora (gracia 3 días), aislamiento multi-gym: auditado y sólido.

---

## 3. App nativa (atleta) — 🔴 (bloqueada por trámite)

**Estado:** Capacitor build listo (iOS + Android generados), ícono 1024×1024, splash 2732×2732, íconos Android en todas las densidades, appId `app.myvelum.platform`, multi-brand configurado. Es `atleta.html` envuelto, se regenera con `build.js`.

**Qué falta para comercializar:**
- 🔴 **P0 — Publicar.** Apple: membresía pagada, **procesando** (hasta 48h) → luego crear app, subir build, submit. Google: esperando **D-U-N-S** → cuenta Organización → submit.
- 🔴 **P0 — Capturas de tienda.** 5 capturas por plataforma (iPhone 6.7" 1290×2796; Android). No existen aún; se toman del simulador con datos demo.
- 🟡 **P1 — Feature graphic de Google Play** (1024×500). No existe — **lo puedo producir yo ya**.
- 🟡 **P1 — Versión en Xcode** (Marketing Version 1.0 / Build 1) — hoy son variables vacías; se ponen al archivar.
- 🟢 Textos de ficha (nombre, subtítulo, descripción, keywords), política de privacidad: listos.

---

## 4. Seguridad & infraestructura — 🟢

**Estado:** RLS activo en todas las tablas. Aislamiento multi-gym **auditado a fondo** esta sesión (un admin solo toca su gym, bloqueado en otros). Login con PBKDF2 + 2FA opcional + rate-limit. Funciones sensibles con EXECUTE revocado. Bug de borrado de paquetes (RLS) corregido.

**Qué falta / vigilar (avisos del linter, ninguno crítico):**
- 🟡 **P1 — `kiosco_lookup` (SECURITY DEFINER, anon-ejecutable).** Revisar que no permita enumerar socios por número sin el PIN del kiosko. Es la función del check-in público; confirmar que su salida es mínima y está protegida.
- 🟡 **P2 — Bucket `storefront-assets` permite listar archivos.** Restringir la policy de SELECT a object-access, no listing.
- 🟡 **P2 — `error_logs` acepta INSERT abierto.** Podría spamearse; conviene rate-limit o restringir.
- 🟢 INFO: `cron_config`/`login_attempts`/`rate_limits` tienen RLS sin policy = acceso denegado salvo service role = **correcto** (bien blindadas).
- 🟢 `pg_net` en schema public: aviso cosmético, sin riesgo real.

---

## 5. Pagos & facturación — 🟡

**Estado:** Stripe Connect Express en vivo (destination charges, comisión por plan: Max 0%, Pro 2%, statement descriptor). Webhook único y limpio. Link de pago manual funciona. Datos fiscales del gym se recolectan (CFDI fase 1).

**Qué falta para comercializar:**
- 🔴 **P0 — Suscripción del gym a VELUM (SaaS billing).** Verificar/cerrar el cobro recurrente del gym hacia VELUM end-to-end: alta de plan → checkout → webhook marca el gym activo → renovación. (Existe el manejo de "SaaS signup" en el webhook; falta confirmar el funnel completo y self-serve.)
- 🔴 **P0 — Timbrado CFDI (Facturapi).** Conseguir cuenta Facturapi + CSD, cablear el timbrado automático tras cada pago. Indispensable para gyms formales en México.
- 🟡 **P1 — Recibos por email** (ligado a Resend, ya cableado).
- 🟢 Cobro en línea de miembros vía storefront/app: funcional.

---

## 6. Marketing & Redes — 🟡

**Estado:** kit de contenido decente ya producido — profile pic, covers (FB/LinkedIn), 5 highlights, **campaña beta** (carrusel de 8 + 5 stories), **grid de lanzamiento** de 9 posts. Hay agentes LAZO (PULSO, CHISPA, VÍNCULO, etc.) reutilizables.

**Qué falta para comercializar:**
- 🔴 **P0 — Presencia viva + cadencia.** Tener los perfiles publicados y un calendario de publicación constante. El kit existe pero hay que ejecutarlo semana a semana.
- 🟡 **P1 — Funnel de captación.** Más allá de `leads_landing`: lead magnet (ej. "auditoría gratis de tu gym"), secuencia de nurturing, y conexión a un CRM/Notion.
- 🟡 **P1 — Pauta pagada (Meta Ads).** Tienes el agente META; definir presupuesto, audiencias (dueños de gyms/box/estudios MX) y creativos a partir del kit.
- 🟡 **P2 — Casos de éxito** de los 4 gyms actuales como contenido.

---

## 7. Growth / Ventas / Pricing — 🟡

**Estado:** pricing definido internamente (Pro $599, Max $999 aprox., límites por plan). Diferenciador claro: Max = 0% comisión.

**Qué falta para comercializar:**
- 🔴 **P0 — Estrategia y proceso de venta.** ¿Cómo llega un gym? (outbound a boxes/estudios, inbound por contenido, referidos de los 4 actuales). Definir el primer canal y un guion de venta/demo.
- 🟡 **P1 — Prueba/Trial.** ¿Hay prueba gratis de X días? Definirlo y reflejarlo en signup + landing.
- 🟡 **P1 — Página/tabla de pricing pública** (ligado a Landing P0).
- 🟡 **P2 — Programa de referidos** (los dueños de gym se conocen entre sí).

---

## 8. Soporte / Éxito del cliente — 🟡

**Estado:** centro de ayuda in-app con 15 guías + contacto WhatsApp. Onboarding wizard guía la config inicial.

**Qué falta para comercializar:**
- 🟡 **P1 — Canal de soporte formal** (WhatsApp Business / correo de soporte) con tiempos de respuesta.
- 🟡 **P1 — Onboarding asistido del primer gym de paga** (sesión 1:1 para que no se caiga el primero).
- 🟡 **P2 — Base de conocimiento pública** (las 15 guías también como web indexable = SEO + autoservicio de prospectos).

---

## 9. Legal / Cumplimiento — 🟡

**Estado:** privacidad y términos publicados.

**Qué falta para comercializar:**
- 🟡 **P1 — Contrato/ToS de SaaS para el gym** (suscripción, cancelación, SLA básico) y **aviso de privacidad alineado a la LFPDPPP** (México).
- 🟡 **P1 — Manejo de datos del atleta** (el gym es responsable, VELUM encargado): dejarlo claro en un acuerdo de tratamiento de datos.
- 🟡 **P2 — Cumplimiento fiscal propio de VELUM** (facturar las suscripciones).

---

## 10. Roadmap sugerido (orden de ataque)

**Sprint 1 — Destrabar la venta (P0):**
1. Funnel self-serve de gyms (signup → plan → pago → activación).
2. Activar Resend (emails).
3. Pricing público + CTA en landing.
4. Publicar app (en cuanto Apple/Google liberen) + capturas + feature graphic.

**Sprint 2 — Formalizar (P1):**
5. Facturapi (CFDI).
6. Endurecer avisos de seguridad (kiosco_lookup, bucket).
7. Presencia en redes + primer canal de adquisición.
8. ToS/contrato SaaS + aviso de privacidad MX.

**Sprint 3 — Escalar (P2):**
9. Casos de éxito, referidos, base de conocimiento pública, dominio propio por gym.

---

## Apéndice — Cerrado esta sesión (no re-trabajar)
Aislamiento multi-gym auditado · bug de borrar paquetes (RLS) · analítica del negocio · centro de ayuda · métricas SaaS en panel · SEO storefront (meta/OG/JSON-LD/sitemap/robots) · modo claro retirado · emails cableados (falta activar Resend) · cap de planes + dunning · renovación + push · webhooks limpios · datos fiscales (CFDI fase 1) · app nativa reconciliada + assets.
