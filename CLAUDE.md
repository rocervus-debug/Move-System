# VELUM — Reglas de operación (VELUM-OS)

Este repo se trabaja bajo **VELUM-OS**: el sistema operativo de calidad de VELUM.
Documento completo: `VELUM_OPERATING_SYSTEM.md`. Lo de abajo es la versión ejecutable
que TODA sesión debe seguir. Roy pone la visión; Claude ejecuta y perfecciona.
Las ideas de Roy pueden venir incompletas o con errores — **cazarlos es parte del trabajo**.

## El pipeline (obligatorio para todo cambio no trivial)

`INTENT → SPEC → PLAN → BUILD → VERIFY → RECORD`

1. **SPEC antes de código.** Si la petición de Roy es no-trivial (feature nueva, cambio de
   comportamiento, toca dinero/seguridad/datos, o >2 archivos), NO construyas directo:
   produce primero una spec de 1 página (usa la skill `/spec`) con: qué/por qué, criterios
   de aceptación medibles, alcance (sí/no), riesgos, y las preguntas o contradicciones que
   detectes en la idea. Espera el "va" de Roy. Fixes triviales y preguntas quedan exentos.
2. **PLAN.** Qué áreas/agentes tocan y en qué orden. Para misiones grandes, el plan puede
   venir del VELUM Studio como orden de trabajo — trátalo como INTENT+PLAN, pero igual
   pasa por SPEC si es no-trivial.
3. **BUILD.** Cambios chicos y verificables. Comentarios en español. Usa la skill de área
   correcta (forja/caudal/aura/escudo/señal/etc. — ver §Agentes).
4. **VERIFY (nadie se lo salta).** Ver §Gates.
5. **RECORD.** Decisiones/gotchas nuevos → memoria. Al final: ofrecer `git push` (solo
   archivos del cambio).

## Gates de VERIFY

- `node --check` (o el checker del lenguaje) sobre todo JS/TS tocado.
- Cambios observables → verificar en preview con evidencia (captura/log), nunca "de palabra".
- Cambios de RLS/permisos → probar con claims simulados:
  `begin; set local request.jwt.claims ...; <query>; rollback;`
- Lógica no trivial → skill `code-review` antes de dar por hecho.
- Todo lo que toque auth, RLS, pagos o datos entre gyms → skill `security-review` / ESCUDO.
- Edge-cases de rigor VELUM: acentos/ñ, día 31 en rangos de fecha, webhooks duplicados,
  multi-tenant (¿qué ve el gym B cuando el gym A hace X?).

## Definition of Done

Una tarea está hecha solo si: cumple los criterios de la spec, respeta este manual, pasó
sus gates, hay evidencia de verificación, lo irreversible tuvo OK de Roy, y lo aprendido
quedó registrado.

## Manual de ingeniería (no negociable)

**Multi-tenant / seguridad**
- Todo query/feature respeta aislamiento por `gym_id`. Nunca asumir un solo gym.
- RLS usa `is_superadmin()` / `auth_gym_id()` / `auth_app_rol()`.
- Ojo con policies SELECT `is_active=true` vs soft-deletes (la fila debe seguir visible
  bajo alguna policy o el "borrado" truena).

**Auth (custom, NO Supabase Auth)**
- Panel: `move-login`; atleta: `velum-atleta-auth`. JWT HS256 con claims `app_rol`+`gym_id`.
- GOTCHA: firmar JWT con `btoa(string)` rompe con acentos/ñ (401 PGRST303). Codificar
  UTF-8 con `TextEncoder` antes de base64url.

**Edge functions (Supabase, project `savzjanpydyjtrgdkllx`)**
- Siempre `Deno.serve` nativo — `deno.land/std` provoca timeouts de bundling al desplegar.
- Webhooks idempotentes: índice único en DB + tolerar error `23505`.
- Deploys y escrituras a producción requieren OK explícito de Roy, cada vez.
- Secrets (Stripe, Anthropic, Resend, keystore) son de Roy: nunca generarlos, pedirlos
  en texto plano ni ponerlos en código cliente.

**Apps**
- 3 apps, UNA marca: `VELUM_Sistema_Interno.html` (panel ~26k líneas), `atleta.html`
  (→ Capacitor iOS/Android), `storefront.html` (pública).
- `velum-app/www` es ARTEFACTO de `atleta.html` vía `velum-app/scripts/build.js` —
  nunca editarlo a mano; regenerar y `npx cap copy`.
- Sin emojis en UI — íconos SVG (preferencia firme de Roy).
- Theming aditivo por `gyms.vertical` (gym cyan #00D4FF / studios champagne #C9A86A /
  recovery salvia #5EC8B0) vía `var(--accent)`. Nunca forkear UI por vertical.

**Stripe**
- El flujo vivo usa `stripe-webhook` / `-checkout-create` / `-connect-onboard`;
  varios `velum-stripe-*` locales están muertos — verificar con list/get_edge_function
  antes de auditar. `gyms.stripe_account_id` es la columna viva (no `gym_config`).

**Proceso**
- `git push`: agregar SOLO archivos del cambio (nunca PDFs/marketing/`.temp`/locks).
- Honestidad sobre el estado: si algo falla, decirlo con la evidencia; nunca maquillar.

## Sistemas de flujo

**Antes de ejecutar cualquier tarea de VELUM, consulta `VELUM_FLUJOS.md` y sigue el pipeline
correspondiente. NÚCLEO es el punto de entrada de toda sesión.** Los 8 flujos:

1. **Desarrollo** — idea/bug → triage NÚCLEO → /spec → build → gate ESCUDO → VERIFY → deploy con OK de Roy → RECORD.
2. **Seguridad** — auditoría semanal de ESCUDO (advisors/policies/logs) + gate por evento en migraciones RLS; protocolo de fuga entre gyms.
3. **Onboarding de gym** — gym creado → bienvenida <24h → activación 48h (≥10 clientes+1 pago) → checkpoints día 7 y 30.
4. **Venta** — lead SIEMPRE registrado → contacto <24h → demo 15min sobre su dolor → trial acompañado → cierre → handoff a APOYO.
5. **Soporte** — clasificar (bug→FORJA / duda→APOYO / dinero→CAUDAL / datos→ESCUDO) → SLA por severidad → documentar.
6. **Release de app** — acumular en PENDIENTES → build.js (nunca editar www) → bump versión → device real → checklist tienda → submit SEÑAL.
7. **Contenido** — calendario semanal VOZ → batch → publicar con CTA → medir GA4 → 1 aprendizaje por ciclo.
8. **Sesión de trabajo (meta)** — NÚCLEO lee flujos+tablero+auditoría → recap → reparte por flujos → cierra con tablero/memoria/push.

## Agentes (skills reales, no roleplay)

NÚCLEO coordina. Áreas: FORJA (panel/backend), CAUDAL (pagos/Stripe/facturación),
AURA (IA/asistentes), CENTINELA (QA/romper), SEÑAL (app nativa/tiendas), IMPULSO
(growth/pricing), ORÁCULO (datos/BI), VOZ (marketing), VITRINA (web pública/SEO),
TRAZO (diseño/design system), APOYO (soporte/onboarding), ESCUDO (seguridad/RLS).
Los 8 primeros viven en el plugin `velum-studio:`; centinela/caudal/aura/oraculo/trazo
en `.claude/skills/`. Úsalos por terreno; en VERIFY entran CENTINELA y ESCUDO.

## VELUM Studio (pizarrón ≠ taller)

`velum-studio.html` + edge function `velum-studio-room` = sala de estrategia visual
(roleplay de los 13 en 1 llamada a Claude). NO ejecuta cambios. Su "orden de trabajo"
exportada entra aquí como INTENT/PLAN y sigue el pipeline normal.
