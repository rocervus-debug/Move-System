# VELUM — Sistemas de flujo operativos

**Qué es esto:** los 8 pipelines que gobiernan CÓMO se ejecuta todo trabajo en VELUM.
**Quién lo usa:** toda sesión de Claude y todo agente (NÚCLEO, FORJA, VITRINA, ESCUDO, SEÑAL,
VOZ, IMPULSO, APOYO + CENTINELA, CAUDAL, AURA, ORÁCULO, TRAZO). **NÚCLEO es el punto de
entrada de toda sesión** y enruta cada tarea a su flujo.
**Jerarquía:** si algo aquí contradice `CLAUDE.md` (VELUM-OS), gana CLAUDE.md — estos flujos
son la capa operativa de ese sistema, no su reemplazo.
**Regla de lectura:** antes de ejecutar una tarea, encuentra su flujo y síguelo paso a paso.
Si la tarea no encaja en ningún flujo, se trata como Flujo 1 (desarrollo) con triage de NÚCLEO.

**Archivos hermanos:** `VELUM_TABLERO.md` (estado vivo), `VELUM_AUDITORIA_MAESTRA.md` y
`VELUM_AUDITORIA_LANZAMIENTO.md` (diagnóstico), `CLAUDE.md` (ley), `.claude/skills/spec/` (gate).

---

## Formato de cada flujo

- **Trigger** — qué lo dispara (sin trigger no se ejecuta "por si acaso").
- **Pipeline** — el diagrama en una línea.
- **Pasos** — numerados, cada uno con `[AGENTE]` responsable, input → output.
- **Hecho cuando** — criterio verificable, no opinión.
- **Errores que ya nos pasaron / errores típicos** — salvaguardas horneadas.

---

## 1. FLUJO DE DESARROLLO (features, bugs, cambios)

**Trigger:** idea de Roy · bug reportado (por gym o detectado) · orden de trabajo del Studio.

**Pipeline:** `INTENT → [NÚCLEO] triage → [SPEC si no-trivial] → BUILD en área → [ESCUDO] si toca datos/auth/dinero → VERIFY → deploy (OK de Roy) → RECORD`

**Pasos:**
1. `[NÚCLEO]` Triage. Input: la petición cruda. Output: prioridad (P0 = bloquea vender/cobrar,
   P1 = importante pronto, P2 = mejora) + agente de área + entrada en `VELUM_TABLERO.md`.
   Un bug reportado por un gym que le impide operar/cobrar es P0 automático.
2. `[agente de área]` ¿Es no-trivial? (feature nueva, cambio de comportamiento, toca
   dinero/seguridad/datos, o >2 archivos) → **`/spec` primero** y esperar el "va" de Roy.
   Fixes triviales y preguntas están exentos. Output: spec de 1 página aprobada.
3. `[FORJA/CAUDAL/AURA/VITRINA/SEÑAL según terreno]` BUILD. Cambios chicos y verificables,
   comentarios en español. Si toca esquema: verificar columnas reales ANTES
   (`information_schema`), nunca asumir. Migraciones con `apply_migration` (DDL versionado).
4. `[ESCUDO]` Gate de seguridad — **obligatorio si el cambio toca RLS, policies, auth,
   SECURITY DEFINER, pagos o datos entre gyms.** Output: visto bueno o lista de correcciones.
5. `[CENTINELA]` VERIFY, nadie se lo salta:
   - `node --check` sobre todo JS/TS tocado (extraer bloques `<script>` si es HTML).
   - Cambio observable → evidencia de preview (captura/log), nunca "de palabra".
   - RLS/permisos → claims simulados: `begin; set local request.jwt.claims ...; <query>; rollback;`
     probando el rol que SÍ puede y el que NO debe.
   - Edge-cases VELUM: acentos/ñ, día 31 en rangos, webhooks duplicados (23505), ¿qué ve el
     gym B cuando el gym A hace X?
6. `[Roy]` Deploy/producción. **Todo deploy de edge function y toda escritura a datos de
   producción requiere OK explícito de Roy, cada vez.** Sin OK, el trabajo queda commiteado
   y anotado en el tablero como "listo para desplegar".
7. `[NÚCLEO]` RECORD. Output: tablero actualizado (ítem → Hecho, con fecha), decisiones/gotchas
   nuevos a memoria, commit + push **solo con los archivos del cambio** (nunca PDFs/marketing
   ajeno/.temp/locks/`velum-app/www`).

**Hecho cuando:** criterios de la spec cumplidos + gates pasados con evidencia + tablero al día
+ (si aplica) desplegado con OK de Roy.

**Errores que ya nos pasaron:**
- Barrido global de texto sin gate de sintaxis → vació emojis dentro de regex y rompió el panel
  (lo salvó `node --check`). Todo cambio masivo pasa el checker ANTES de darse por hecho.
- Asumir columna que no existe (`is_active` vs `activo` en gyms) → consultar esquema primero.
- Edge functions con `deno.land/std` → timeouts de bundling; usar `Deno.serve` nativo.
- `btoa()` sobre strings con acentos/ñ al firmar JWT → 401; usar TextEncoder UTF-8.
- Editar `velum-app/www` a mano → es artefacto; se regenera con `build.js`.
- Construir directo "porque está clarito" → el 80% de los errores de Roy se cazan en la spec.

---

## 2. FLUJO DE SEGURIDAD (ESCUDO)

**Trigger — dos modos:**
- **Cadencia semanal** (primera sesión de la semana, NÚCLEO lo agenda).
- **Por evento:** toda migración que toque RLS/policies/funciones SECURITY DEFINER/auth,
  ANTES de aplicarla; y todo reporte de "veo datos que no son míos".

**Pipeline semanal:** `advisors → policies nuevas → error_logs/login_attempts → reporte → fixes al Flujo 1`

**Pasos (semanal):**
1. `[ESCUDO]` Correr `get_advisors` (security y performance) en Supabase. Output: lista de lints.
2. `[ESCUDO]` Diff de policies y funciones vs semana anterior (¿apareció un `USING (true)` en
   INSERT/UPDATE? ¿una SECURITY DEFINER nueva expuesta a `authenticated`/`anon`?).
3. `[ESCUDO]` Revisar `error_logs` y `login_attempts` de los últimos 7 días: picos, patrones
   de fuerza bruta, errores 4xx/5xx repetidos en edge functions (`get_logs`).
4. `[ESCUDO]` Reporte en el tablero (sección P1 si hay hallazgos) con este formato:
   `[SEV crítico/alto/medio/info] hallazgo · tabla/función · acción propuesta · dueño`.
5. Los fixes entran por el **Flujo 1** (los críticos como P0).

**Protocolo de posible fuga entre gyms (por evento, se suspende todo lo demás):**
1. `[ESCUDO]` **Confirmar**: reproducir con claims simulados del gym afectado y de otro gym.
   Si no reproduce, documentar y cerrar (puede ser confusión de UI).
2. `[ESCUDO+Roy]` **Contener**: deshabilitar la policy/feature culpable (OK de Roy si es prod).
   Mejor una feature caída una hora que datos cruzados un día.
3. `[ESCUDO]` **Medir alcance**: qué tablas/filas, qué gyms, desde cuándo (audit_log, logs).
4. `[FORJA/ESCUDO]` **Corregir** vía Flujo 1 acelerado + round-trip completo
   (INSERT/SELECT/UPDATE/DELETE con claims de ambos gyms).
5. `[NÚCLEO]` **Post-mortem** a memoria (causa raíz, cómo se detecta antes) y, si hubo datos
   personales expuestos, **Roy decide** la notificación a los gyms afectados (LFPDPPP).

**Hecho cuando:** reporte semanal en tablero (aunque diga "sin hallazgos") · fugas: alcance
medido + fix verificado con claims + post-mortem registrado.

**Errores típicos:**
- Policy SELECT con `is_active=true` que choca con soft-delete → el "borrado" truena.
- Probar solo el rol feliz: siempre probar también atleta y el gym B.
- Marcar el advisor como "ruido" sin leerlo (así se nos coló `update_gym_fiscal_data` meses).
- Arreglar la fuga sin medir el alcance — no sabes qué decirle al cliente si pregunta.

---

## 3. FLUJO DE ONBOARDING DE GYM (APOYO)

**Trigger:** webhook de Stripe crea un gym (registro self-serve) o alta manual de Roy.

**Pipeline:** `gym creado → bienvenida <24h → datos cargados <48h → semana guiada → checkpoint d7 → checkpoint d30`

**Pasos:**
1. `[auto]` Al crearse el gym: secuencia `velum-trial-nurture` envía emails día 0/1/3/6
   (bienvenida+3 pasos, migración gratis, funciones clave, fin de trial honesto).
2. `[Roy/APOYO]` **Bienvenida humana <24h** por WhatsApp/llamada. Guion: felicitar, preguntar
   giro y tamaño, ofrecer migrar su Excel/libreta HOY gratis. Este paso es el que separa un
   trial vivo de uno muerto — no es opcional mientras haya <30 clientes.
3. `[APOYO]` **Activación en 48h** = el gym tiene ≥10 clientes cargados + 1 pago registrado +
   check-in activado. Si Roy hace la migración, se logra en la llamada misma.
4. `[APOYO]` Semana guiada: 1 mensaje útil cada 2 días (no spam): "ya puedes ver X",
   "¿probaste el asistente?". Responder dudas → Flujo 5.
5. `[APOYO]` **Checkpoint día 7** (antes del cobro del día 8): consultar uso real
   (asistencias>0, pagos>0 en la semana). Con uso → mensaje de "así te fue en tu semana 1"
   con sus números. Sin uso → **llamada de rescate**: qué lo atoró; si el producto no le
   sirve, facilitarle cancelar (churn honesto hoy > chargeback mañana).
6. `[APOYO]` **Checkpoint día 30**: revisión de valor con números del gym (clientes,
   cobros registrados, check-ins). Pedir: testimonio + 1 referido (1 mes gratis a ambos).
7. `[ORÁCULO]` Registrar métricas: activación 48h (%), uso d7, conversión trial→pago, churn
   d30, motivo textual de toda cancelación.

**Hecho cuando:** el gym pasó su checkpoint d30 con uso activo, o canceló CON motivo registrado.

**Errores que ya nos pasaron:**
- **Functional Gym**: trial que entró, cargó 0 clientes y canceló — nadie lo llamó. El
  self-serve sin acompañamiento humano no retiene (todavía).
- Onboarding sin datos = el gym ve un dashboard vacío y no ve el valor. La migración del
  Excel ES el onboarding.
- No registrar el motivo del churn: cada cancelación sin motivo es aprendizaje tirado.

---

## 4. FLUJO DE VENTA (IMPULSO)

**Trigger:** entra un lead — WhatsApp, formulario de la landing (`leads_landing` / lead-capture),
referido, o prospección activa (listas tipo `VELUM_Prospectos_Bajio.xlsx`).

**Pipeline:** `lead registrado → contacto <24h → calificación → demo 15min → trial acompañado → cierre → handoff a APOYO`

**Pasos:**
1. `[IMPULSO]` **Registrar SIEMPRE el lead** (aunque llegue por WhatsApp): nombre, giro
   (gym/studio/recovery), tamaño estimado, canal de origen, fecha. Sin registro no hay funnel,
   solo conversaciones sueltas.
2. `[Roy]` **Primer contacto <24h.** Un lead de fitness que no recibe respuesta en un día se
   enfría; a la semana está muerto.
3. `[IMPULSO]` Calificar (BANT-lite): ¿tiene negocio operando? ¿cuántos clientes? ¿qué le
   duele hoy (cobros/reservas/control)? ¿urgencia? Output: caliente (demo ya) / tibio
   (nurture) / no-fit (descartar con cortesía).
4. `[Roy]` **Demo de 15 min sobre SU dolor**, no tour de features: 5 min su problema,
   8 min VELUM resolviéndolo (con el vertical y vocabulario correcto), 2 min precio ($999
   todo incluido, 0% comisión, 7 días gratis) + caso de éxito (`marketing/casos/`).
5. `[IMPULSO]` Trial iniciado → entra al **Flujo 3** (onboarding). La venta no termina en el
   registro: termina en el cobro del día 8.
6. `[Roy]` Cierre: si duda por precio → ancla (~$33/día, 1 membresía); si duda por cambio →
   migración gratis; si es cadena → propuesta por volumen (tarjeta Cadenas). Si no cierra:
   motivo registrado + nurture mensual (1 mensaje de valor, no de presión).
7. `[IMPULSO→APOYO]` Handoff con contexto: giro, tamaño, dolor principal, qué se le prometió.
   APOYO no debe empezar de cero.

**Métricas por etapa `[ORÁCULO]`:** leads/semana por canal · % contactados <24h · demos
agendadas · demo→trial (%) · trial→pago (%) · CAC por canal · motivo de pérdida.

**Hecho cuando:** el lead está en un estado terminal registrado — pagando (handoff hecho),
nurture (con fecha del siguiente toque) o descartado (con motivo).

**Errores típicos:**
- Leads de WhatsApp que viven solo en el chat → a la semana nadie sabe cuántos hubo. (Hoy
  las tablas `leads`/`leads_landing` tienen 0 filas: este flujo existe para que eso cambie.)
- Demo genérica de gym a una dueña de estudio de pilates → usar su vertical y su página.
- Prometer features que no existen: lo que se promete se anota en el handoff y se cumple o
  no se promete.

---

## 5. FLUJO DE SOPORTE

**Trigger:** cualquier mensaje de un gym cliente (WhatsApp 56 6607 3955 / hola@myvelum.app).

**Pipeline:** `entra → clasificar → SLA por severidad → resolver → confirmar → documentar`

**Pasos:**
1. `[APOYO]` Clasificar en el primer toque:
   - **Bug** (algo no funciona) → `[FORJA]` vía Flujo 1, con severidad.
   - **Duda de uso** → `[APOYO]` responde con la guía del centro de ayuda; si la guía no
     existe, se responde manual Y se crea la guía.
   - **Dinero/cobros** (pago no registrado, webhook, Stripe) → `[CAUDAL]`.
   - **Seguridad/datos** ("veo datos que no son míos") → `[ESCUDO]` protocolo del Flujo 2, ya.
2. `[NÚCLEO]` SLA por severidad (hábil = L-S 9:00–19:00 CDMX, lo que promete el footer):
   - **Crítica** (no puede operar/cobrar): primera respuesta <2h, resolución <24h.
   - **Alta** (función importante degradada): respuesta <4h, resolución <72h.
   - **Normal** (duda, mejora): respuesta <24h.
   No prometer SLAs que una persona no puede cumplir; estos son alcanzables hoy.
3. `[área]` Resolver. Los bugs siguen el Flujo 1 completo (con gates), aunque el fix sea de
   una línea — los hotfixes sin verificar generan el ticket de mañana.
4. `[APOYO]` Confirmar con el gym que quedó ("¿ya te funciona?") — un ticket no se cierra solo.
5. `[APOYO]` Documentar: si la misma duda llega 2 veces → guía nueva en el centro de ayuda;
   si el mismo bug llega 2 veces → causa raíz al tablero como P1 mínimo.

**Hecho cuando:** el gym confirmó la solución + quedó rastro (guía nueva, ítem de tablero, o
nota en la conversación de ese gym).

**Errores típicos:**
- Resolver todo en WhatsApp sin documentar: la 3ª vez cuesta lo mismo que la 1ª y no escala.
- Bug reportado que se arregla "al vuelo" y nunca entra al tablero → reaparece en el
  siguiente cambio porque nadie supo que existía.
- Dejar tickets abiertos sin estado: si se acumulan >5 sin responder, NÚCLEO lo trata como
  P0 de la sesión (es señal de que hace falta el CS a medio tiempo — ver plan de equipo).

---

## 6. FLUJO DE RELEASE DE APP (SEÑAL)

**Trigger:** cambios en `atleta.html` que deben llegar a la app nativa · fix urgente pedido
por la tienda · rechazo de review.

**Pipeline:** `acumular en PENDIENTES → decidir build → regenerar www → cap sync → bump versión → build iOS+Android → probar en device → checklist tienda → submit → monitorear review → tag`

**Pasos:**
1. `[SEÑAL]` Los cambios de app se **acumulan en `PENDIENTES_PROXIMA_BUILD.md`** — no se
   compila por cada fix. Se dispara build cuando hay P0 de app o ≥3 pendientes con valor.
2. `[SEÑAL]` Regenerar artefacto: `node velum-app/scripts/build.js` → `npx cap copy` (o
   `sync` si cambió config/plugins). **Prohibido editar `velum-app/www` a mano.**
3. `[SEÑAL]` Bump de versión: iOS version+build, Android `versionCode` (Play rechaza si no
   sube) — anotar en PENDIENTES qué versión corresponde a qué cambios.
4. `[SEÑAL]` Builds: iOS archive en Xcode · Android `.aab` firmado (keystore es de Roy).
5. `[Roy+SEÑAL]` **Prueba en device físico** antes de subir — camino mínimo: login (socio con
   membresía Y socio con paquete de clases), reservar clase, check-in QR, ver programa.
   El crash de "No se pudo conectar" que enmascara errores de render se caza aquí.
6. `[SEÑAL]` Checklist de tienda: capturas vigentes (si cambió la UI), App Privacy al día,
   notas del revisor con cuenta demo (PULSE / VelumDemo2026), `PrivacyInfo.xcprivacy` (iOS),
   feature graphic (Android).
7. `[Roy]` Submit (las cuentas de Apple/Google son suyas). Android nuevo: closed testing
   requiere 12 testers × 14 días antes de producción.
8. `[SEÑAL]` Monitorear review diario; rechazo → responder/corregir <24h (los rechazos
   envejecen mal). Aprobada → tag en git (`app-vX.Y.Z`) + tablero + PENDIENTES limpiado.

**Hecho cuando:** versión aprobada y visible en la tienda + tag + PENDIENTES vaciado de lo
que se embarcó.

**Errores que ya nos pasaron / típicos:**
- Editar `www` directo y perderlo en el siguiente build.
- Submit sin probar el login de un socio con paquete de clases (crasheó en prod).
- Compilar "un fix rápido" cada vez → 3 builds en review simultáneos y confusión de versiones.
- Prometer notificaciones push en la ficha con `PUSH_ENABLED=false`.

---

## 7. FLUJO DE CONTENIDO/MARKETING (VOZ)

**Trigger:** cadencia semanal fija (mismo día, p.ej. lunes) — no "cuando haya inspiración".

**Pipeline:** `calendario semanal → producción en batch → publicación en horario fijo → medición → 1 aprendizaje → siguiente ciclo`

**Pasos:**
1. `[VOZ]` Calendario de la semana: 2-3 piezas máx, sostenibles. Rotar pilares: dolor
   (libreta/WhatsApp/no-shows) · caso real con números (`marketing/casos/`) · producto
   (1 feature = 1 dolor resuelto) · vertical (alternar gym/studios/recovery).
2. `[VOZ+TRAZO]` Producción en batch (una sentada): copies + visuales con plantillas de
   marca. Sin emojis en gráficos de marca (SVG/tipográfico); número real > adjetivo
   ("508 check-ins" > "muchísima asistencia"). Nunca inventar cifras.
3. `[VOZ]` Publicar en días/horas fijos. Toda pieza lleva UN CTA: landing general o la
   página del vertical (`para-estudios` / `para-recovery`) según el tema.
4. `[ORÁCULO]` Medición al cierre de semana: alcance por pieza + eventos GA4 en la landing
   (hero_cta_click, plan_selected, wa_float_click) + leads generados (→ Flujo 4).
5. `[VOZ]` **1 aprendizaje escrito** ("los reels de dolor traen 3× más clics que los de
   feature") → alimenta el calendario siguiente. Sin aprendizaje anotado, el ciclo no cerró.

**Hecho cuando:** lo calendarizado se publicó + medición registrada + 1 aprendizaje anotado.

**Errores típicos:**
- Arrancar con 5 posts/semana y morir al 2º ciclo — 1-2 sostenidos ganan siempre.
- Publicar sin CTA → likes que no van a ningún lado del funnel.
- Hablar de features ("tenemos dashboard") en vez de dolores ("¿sabes cuánto cobraste hoy?").
- Números inventados: VELUM presume cifras reales de producción o no presume.

---

## 8. FLUJO DE SESIÓN DE TRABAJO (el meta-flujo)

**Trigger:** Roy llega — "qué sigue", "buenos días", "ponme al día", o cualquier arranque.

**Pipeline:** `[NÚCLEO] lee flujos+tablero+auditoría → recap → repartir por flujos → ejecutar → cerrar ciclo (tablero+memoria+push)`

**Pasos:**
1. `[NÚCLEO]` Leer, en este orden: `VELUM_FLUJOS.md` (este archivo), `VELUM_TABLERO.md`,
   y la auditoría vigente (`VELUM_AUDITORIA_LANZAMIENTO.md` / `VELUM_AUDITORIA_MAESTRA.md`).
   **Si el tablero tiene >7 días sin actualizar, reconciliarlo ANTES de repartir trabajo**
   (contrastar con git log y estado real; un tablero viejo reparte trabajo fantasma).
2. `[NÚCLEO]` Recap de 3-6 líneas: P0 vigentes · en curso · cerrado desde la última sesión ·
   decisiones pendientes de Roy (deploys esperando OK, elecciones abiertas).
3. `[NÚCLEO]` Repartir: cada tarea entra por SU flujo — desarrollo→1, seguridad→2,
   onboarding→3, venta→4, soporte→5, app→6, contenido→7. Nada se ejecuta "suelto".
4. `[agentes]` Ejecutar dentro de sus pipelines. NÚCLEO coordina, no hace el trabajo de área.
5. `[NÚCLEO]` Durante la sesión: el tablero se actualiza **al cerrar cada ítem**, no todo al
   final (los finales de sesión se interrumpen y se pierde el registro).
6. `[NÚCLEO]` Cierre de sesión (RECORD):
   - Tablero con fecha de actualización de hoy.
   - Decisiones y gotchas nuevos → memoria persistente.
   - Commit + push de los archivos del cambio (regla de CLAUDE.md).
   - Lista explícita de "esperando a Roy" (deploys, OKs, cuentas) para que la siguiente
     sesión no lo re-descubra.

**Hecho cuando:** Roy sabe qué se hizo, qué sigue y qué espera su decisión — y eso mismo está
escrito en tablero/memoria, no solo dicho en el chat.

**Errores que ya nos pasaron:**
- Tablero congelado semanas (quedó al 17-jun mientras el trabajo siguió) → la sesión
  siguiente ve prioridades falsas. El paso 1 lo reconcilia SIEMPRE.
- Cerrar sesión sin registrar decisiones → la siguiente re-deriva todo (costo real de tokens
  y de errores).
- Trabajar lo urgente-chiquito y esquivar el P0 incómodo (la llamada de venta, el submit):
  NÚCLEO abre cada sesión nombrando el P0 aunque no sea tarea de código.
