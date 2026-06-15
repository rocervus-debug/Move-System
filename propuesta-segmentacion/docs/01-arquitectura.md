# FASE 1–2 — Taxonomía de verticales y arquitectura de plataforma

## FASE 1 — Taxonomía de verticales

Una vertical merece su propia capa cuando **cambian los sustantivos del negocio y las métricas que importan**, no sólo el color. Criterio: ¿el dueño mide su día con otras cifras? ¿el flujo central es otro?

| Vertical | A quién sirve | Mecánica central | Métricas que cambian | Módulos que cambian | ¿Capa propia? |
|---|---|---|---|---|---|
| **Studios** (boutique) | Pilates, barre, cycling, yoga, lagree | Reserva por clase + **créditos/paquetes** + **spot/reformer** + waitlist | Ocupación %, no-shows, breakage de créditos, ocupación por horario | Calendario de reservas, paquetes de créditos, asignación de spot, instructores | **Sí** |
| **Gym** (tradicional) | Gimnasio de pesas/cardio, 24/7 | **Membresía mensual + control de acceso** | Accesos/día, aforo, morosidad, renovaciones, churn | Control de acceso en vivo, membresías/planes, PT, rutinas | **Sí** |
| **Box / Functional** | CrossFit, functional training | **Programación (WOD) + comunidad + PRs** | Asistencia al WOD, PRs, RX vs escalado, retención de comunidad | WOD del día, **leaderboard**, benchmarks, registro de marcas | **Sí** |
| **Performance / Hyrox** | Entrenamiento por estaciones, racing | **Programación por estaciones + heats + marcas cronometradas** | Tiempos por estación, total vs meta de categoría, simulacros | Heats, estaciones, tracking de marcas, bloques de programación | **Sí** (rama de Box) |
| **Combat** (artes marciales) | BJJ, muay thai, boxeo, karate | **Progresión de grados/cinturones + niveles + exámenes** | Alumnos por grado, tiempo en grado, listos para examen, sparring | Progresión de cinturones, niveles por clase, exámenes, sparring | **Sí** |
| **Recovery / Wellness** | Spa fitness, crio, sauna, masaje | **Cita 1-a-1 por recurso + protocolos** (no clases grupales) | Ocupación por recurso, citas/día, no-shows, paquetes de sesiones | Agenda por recurso, protocolos de recuperación, paquetes | **Sí** (la más distinta) |

**Descartes / matices honestos:**
- **Performance** es técnicamente una *configuración* de Box (programación + atletas), pero con vocabulario y métricas tan distintas (estaciones, heats, mm:ss) que se presenta como vertical propia con preset diferenciado. Comparte ~70% con Box.
- **Recovery** es la más alejada del core class-based: su unidad no es la "clase" sino la "cita por recurso". Reutiliza cobro/clientes/paquetes pero introduce el concepto **recurso reservable** (sauna, cabina), que es nuevo.
- No se proponen verticales sin caso real (p.ej. "nutrición" sola) hasta tener demanda; el modelo permite agregarlas después sin tocar el core.

## FASE 2 — Arquitectura de la plataforma

Objetivo: **un solo código y un solo backend** sirviendo seis productos. Tres capas.

### 1. CORE compartido — *(ya existe en su mayoría)*
Auth/JWT, RLS multi-tenant por `gym_id`, `clientes`, `pagos`+`packages`, `gastos`, reporting (revenue/retención), `coaches`/`usuarios`, storefront+Stripe, dashboard shell, configuración. **No se duplica nunca.**

### 2. Capa de configuración por vertical — *(nuevo, el corazón de la propuesta)*
Un registro de configuración por gym define su vertical y, a partir de ahí, **módulos on/off, vocabulario, campos y flujos**. Se apoya en la tabla `gym_config` que ya existe (key/value por gym): basta agregar claves.

```jsonc
// gym_config (conceptual) — clave "vertical_profile" por gym_id
{
  "vertical": "studios",
  "modules": { "reservas": true, "creditos": true, "accesos": false,
               "wod": false, "grados": false, "recursos": false },
  "vocab":   { "clase": "clase", "coach": "instructor",
               "miembro": "cliente", "asistencia": "reserva" },
  "booking_model": "spot",      // spot | open | resource | none
  "membership_model": "credits" // credits | monthly | hybrid
}
```

El **mismo shell** lee este perfil y: pinta el sidebar con los módulos activos, sustituye etiquetas (`"clase"` → `"sesión"` / `"WOD"` / `"cita"`), y enciende los flujos correctos (reserva con spot vs check-in de acceso vs cita por recurso). **Esfuerzo: medio.**

### 3. Sistema de temas (tokens intercambiables) — *(nuevo, trivial-medio)*
El `data-vertical` del `<body>` (o una clase derivada de `gym_config.vertical`) reescribe los **design tokens** (color, tipografía, densidad, radios, sombras) sin tocar el markup. Es exactamente lo que demuestra [`assets/velum-core.css`](../assets/velum-core.css): un solo CSS, seis temas. **Esfuerzo: trivial** (ya construido como prueba).

### Modelo multi-tenant (sin fugas entre verticales)
- **No cambia el aislamiento existente.** Cada gym sigue separado por `gym_id` vía RLS (`gym_id = auth_gym_id()`). La "vertical" es **un atributo del tenant**, no un esquema ni una base distinta.
- Dos gyms de verticales distintas conviven en las mismas tablas; cada uno sólo ve sus filas. Un Studios y un Box comparten la tabla `reservas`/`packages` pero jamás se cruzan (RLS).
- Las tablas nuevas que pидан algunas verticales (`waitlist`, `spots`, `grados`, `recursos`, `marcas`) llevan `gym_id` + la misma política `gym_isolation`. **Cero excepciones al patrón.**

### Etiquetado de esfuerzo por pieza
| Pieza | Esfuerzo |
|---|---|
| Sistema de temas (tokens por `data-vertical`) | **Trivial** (hecho) |
| Vocabulario / etiquetas configurables | Trivial |
| Toggle de módulos on/off por gym (sidebar + rutas) | **Medio** |
| Perfil de vertical en `gym_config` + selector al onboarding | Medio |
| `waitlist` (tabla + UI + promover) | Medio |
| Asignación de spot/reformer (tabla `spots` + mapa de sala) | **Pesado** |
| Programación por estaciones (Hyrox) y leaderboard (Box) | Medio-pesado |
| Progresión de grados/cinturones (Combat) | Medio |
| Recurso reservable + protocolos (Recovery) | **Pesado** (modelo nuevo de agenda) |
| Refactor del front monolítico a módulos cargados por config | **Pesado** (es el mayor riesgo, ver viabilidad) |

→ Paletas y tipografías por vertical en [`02-design-systems.md`](02-design-systems.md). Veredicto y roadmap en [`03-viabilidad-roadmap.md`](03-viabilidad-roadmap.md).
