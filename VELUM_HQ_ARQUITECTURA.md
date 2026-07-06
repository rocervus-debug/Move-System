# VELUM HQ — Arquitectura del sistema de superadmin
**Fecha:** 2026-07-06 · **Estado:** propuesta (esperando "va" de Roy para F1)

## Qué es

La app de operación de VELUM-la-empresa, separada del panel de gyms. El panel administra
UN gym; HQ administra el NEGOCIO: leads, cuentas, cobros, salud de clientes y la agenda
del founder. Solo la ve `app_rol='superadmin'`.

## Principios de diseño

1. **Reusar, no forkear.** Mismo proyecto Supabase, misma auth (`move-login` + JWT claims),
   mismas edge functions donde existan (`velum-saas-metrics`, `velum-saas-portal`,
   `velum-stripe-balance`). Cero infraestructura nueva.
2. **App separada** (`VELUM_HQ.html`, ~3-5k líneas, mismo stack vanilla): usuario distinto,
   ritmo distinto, y cero riesgo de filtrar UI cross-gym al contexto de un gym.
3. **El CRM pegado a la base de producción** es la ventaja: cuando un lead se convierte en
   gym, su historial comercial y su uso real quedan unidos — eso no lo da ningún CRM externo.
4. **V1 vendedora-first.** Solo lo que ayuda a cerrar y cobrar HOY. Lo enterprise (tickets,
   BI profundo) espera a >10 clientes pagando.
5. Design system de TRAZO: tokens VELUM, cyan, SVG, sin emojis.

## Módulos

### 1. Cockpit (home)
- Los 3 números que definen todo (de la auditoría): **gyms pagando** · **activación 48h** ·
  **GMV→MRR**. Meta mensual visible.
- Gráfica de MRR/GMV por mes (datos de `pagos` + `gyms`).
- Feed de eventos recientes: trial nuevo, pago registrado, cancelación (lee de `gyms`,
  `member_subscriptions`, `velum_trial_emails` — sin webhooks nuevos en v1).

### 2. Pipeline (CRM) — el corazón
- Kanban con las etapas del Flujo 4: `lead → contactado → calificado → demo → trial →
  pagando → perdido(motivo) → nurture`.
- Ficha de lead: empresa, vertical, ciudad, canal, contacto, sistema actual, ángulo, tier,
  próxima acción CON FECHA, notas.
- Bitácora por lead (`saas_lead_events`): cada llamada/mensaje/demo con fecha — el registro
  obligatorio del Flujo 4 deja de vivir en la cabeza de Roy.
- Entradas: captura manual · **import del Excel Bajío** (36 leads el día uno) · puente
  automático desde `leads_landing` (el lead-capture de la landing) con canal='landing'.
- Al ganar un lead → botón "convertir a gym" que enlaza con el registro/alta y hereda el
  historial.

### 3. Cuentas y cobros
- Cada gym como cliente: estado (`trial d-X` / activo / moroso / owner-cortesía / cancelado),
  plan, próxima fecha de cobro, founder sí/no.
- MRR real calculado con la definición canónica de ORÁCULO (owner no cuenta).
- Acciones: abrir customer portal de Stripe, marcar founder, nota de cuenta.
- Morosos al frente: pago fallido = tarea automática (conecta con dunning de CAUDAL cuando exista).

### 4. Salud y retención (alimenta a APOYO)
- Semáforo por gym con datos reales 30d: clientes, pagos, asistencias, último uso.
  Verde = uso alto · Amarillo = se enfría (sin actividad 7d) · Rojo = riesgo (sin uso o
  trial muerto).
- Checkpoints del Flujo 3 (d7/d30) generados como tareas automáticas por gym nuevo.

### 5. Tareas del día (la agenda del founder) — función agregada
Auto-generadas por reglas, más manuales:
- lead sin contacto >24h → "follow-up a X"
- trial en día 6 sin uso → "llamada de rescate a X"
- gym nuevo → "bienvenida <24h a X"
- checkpoint d7/d30 vencido → tarea
- pago fallido → "cobranza X"
Es el VELUM_TABLERO comercial hecho software: cada mañana HQ te dice a quién hablarle.

### 6. (v1.5) Monitor de secuencias
- Qué email de `velum-trial-nurture` salió a quién (`velum_trial_emails` ya existe).

### 7. (v2 — no construir aún)
- Soporte/tickets con SLAs del Flujo 5 · cohortes y BI profundo · radar de tiendas/advisors
  (feed de ESCUDO) · automatizaciones de cobranza · multi-usuario (cuando exista el CS).

## Modelo de datos (nuevo)

```
saas_leads            id, empresa, vertical(gym|studios|recovery), ciudad, canal,
                      contacto(jsonb: tel/mail/ig/web), sistema_actual, angulo, tier(A|B|C),
                      etapa, motivo_perdido, proxima_accion, proxima_accion_fecha,
                      gym_id(null hasta convertir), created_at, updated_at
saas_lead_events      id, lead_id→saas_leads, tipo(mensaje|llamada|demo|nota|etapa),
                      detalle, created_at
saas_tasks            id, titulo, tipo(auto|manual), regla_origen, lead_id?, gym_id?,
                      due_date, done_at
gym_notes             gym_id, nota, created_at        (bitácora de cuenta)
```
Todo con RLS: `USING (is_superadmin())` en SELECT/INSERT/UPDATE/DELETE — nadie más que el
claim superadmin las toca, ni siquiera admins de gym.

**Lo que NO se crea:** nada de duplicar `gyms`, `pagos`, `member_subscriptions` — HQ los lee
directo (superadmin ya pasa las policies existentes).

## Seguridad

- Login con `move-login`; el cliente exige `app_rol='superadmin'` y redirige si no.
- La defensa real es RLS (el gate del cliente es UX, no seguridad).
- Página sin enlaces públicos, `noindex`, fuera del sitemap.
- Gate ESCUDO obligatorio antes de desplegar las tablas/policies (Flujo 1 paso 4) +
  claims simulados: superadmin ✓, admin de gym ✕, atleta ✕.

## Fases de construcción (cada una una sesión, con gates)

- **F1 — Pipeline vivo:** migración de tablas + RLS → esqueleto HQ (login, nav) → CRM
  completo con kanban + bitácora + import de los 36 del Bajío + puente leads_landing.
  *Criterio de hecho: los 14 mensajes Tier A del kit se pueden registrar y dar seguimiento
  desde HQ.*
- **F2 — Cockpit + Cuentas:** los 3 números, gráfica MRR/GMV, vista de cuentas con estados
  y acciones Stripe.
- **F3 — Salud + Tareas:** semáforos, reglas automáticas, checkpoints d7/d30.
- **F4 (v1.5+):** monitor de secuencias, y lo de v2 cuando el negocio lo pida.

Requisito técnico: F1 necesita el MCP de Supabase reconectado (migraciones) y, como todo,
deploy/escrituras con OK de Roy.
