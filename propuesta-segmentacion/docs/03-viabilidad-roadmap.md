# FASE 5 — Veredicto de viabilidad y roadmap

## ¿Viable sobre el sistema actual (front + Supabase)?

**Sí, con condiciones.** No es un rediseño desde cero: es **extraer una capa de configuración** sobre un core que ya existe y ya es multi-tenant. El backend ya carga las tres mecánicas que definen las verticales (accesos, reservas+créditos, programación). La condición principal es **modularizar el front monolítico** (un `.html` de ~23k líneas) lo suficiente para encender/apagar módulos por gym sin romper lo que funciona hoy.

## % estimado de reutilización vs desarrollo nuevo

| Capa | Reutilización | Comentario |
|---|---|---|
| Backend / datos / RLS / auth | **~85%** | Multi-tenant, cobro, clientes, accesos, reservas, programación ya existen. Faltan tablas puntuales (`waitlist`, `spots`, `grados`, `recursos`, `marcas`). |
| Componentes de UI (cards, KPIs, tablas, wizards, shell) | **~90%** | El design system ya es sólido; el theming por tokens es aditivo. |
| Lógica de negocio core (pagos, membresías, dashboard, reporting) | **~80%** | Sirve a todas; sólo cambian etiquetas y qué métricas se destacan. |
| Flujos específicos por vertical (spot/reformer, heats, grados, recursos) | **~25%** | Es el desarrollo nuevo real. |
| **Promedio ponderado del producto** | **~70% reutilización / 30% nuevo** | El 30% es mayormente la capa de config + 2–3 flujos pesados. |

## Riesgos técnicos reales

1. **Front monolítico (el mayor).** Encender módulos por config sobre un único `.html` de 23k líneas es frágil. Riesgo de regresiones al tocar el archivo. → *Mitigación:* introducir módulos por sección sin reescribir todo de golpe; el sidebar y las vistas ya están separados por `#v-*`, lo que ayuda.
2. **Modelo de datos de los flujos nuevos.** `spots`/`reformers`, `grados`, `recursos reservables` y `marcas` necesitan tablas nuevas bien diseñadas (con `gym_id` + `gym_isolation`). Riesgo de acoplar mal con `reservas`/`horarios` existentes.
3. **`waitlist` ya está referenciada pero no existe** (hallazgo de la auditoría) → hay deuda: el código asume una tabla ausente. Crearla bien es prerequisito de Studios/Box.
4. **RLS al agregar tablas.** Cada tabla nueva debe llevar la política `gym_id = auth_gym_id()` sin excepción; un olvido = fuga entre tenants. Riesgo controlado si se sigue el patrón existente.
5. **Mantenimiento de 6 temas + N módulos.** Combinatoria de QA. → *Mitigación:* los temas son sólo tokens (bajo costo); los módulos son el costo real, por eso se lanzan por fases.
6. **Vocabulario configurable** mal hecho puede ensuciar el código con condicionales. → *Mitigación:* un diccionario central por vertical, no `if` regados.

## Roadmap por fases

**Fase A — Cimientos de plataforma (sin nuevas verticales aún)**
- Agregar `vertical_profile` a `gym_config` (vertical, módulos on/off, vocabulario, modelos de booking/membership).
- Implementar el **sistema de temas por `data-vertical`** (ya prototipado aquí) en el panel real.
- Hacer que el sidebar y las rutas lean los módulos activos del perfil.
- Selector de vertical en el onboarding del gym nuevo.

**Fase B — Lanzar la primera vertical "fácil" sobre el core**
- **Gym tradicional** primero (ver recomendación). Casi todo su flujo (accesos, membresías, morosidad, renovaciones) ya existe; es mayormente **re-priorizar el dashboard + tema + vocabulario**. Bajo riesgo, valida la arquitectura con clientes reales.

**Fase C — Class-based (Studios + Box)**
- Crear `waitlist` (cerrar la deuda) y `spots`/`reformers`.
- Calendario de reservas con asignación de spot, waitlist y políticas de no-show.
- Box reutiliza reservas + suma `wod` (sobre `programas` existente) y `leaderboard`/`marcas`.

**Fase D — Verticales especializadas**
- **Performance** (preset de Box + estaciones/heats/marcas cronometradas).
- **Combat** (`grados`/cinturones + niveles + exámenes).
- **Recovery** (modelo nuevo de **recurso reservable** + protocolos) — la más cara, al final.

**Fase E — Pulido de plataforma**
- Marketplace de plantillas por vertical, métricas comparativas, multi-sucursal.

## Recomendación: ¿qué vertical lanzar primero?

**VELUM Gym (tradicional).** Razones:
1. **Es el de mayor reutilización** (~85%): membresías, accesos, kiosko, morosidad y renovaciones ya están construidos y en producción. Lanzarlo es sobre todo **tema + vocabulario + re-priorizar el dashboard**, no desarrollo nuevo.
2. **Es el mercado más grande y menos exigente en features** que un boutique (que pide spots/waitlist/créditos, todo desarrollo nuevo).
3. **Valida la capa de configuración con riesgo mínimo** antes de invertir en los flujos pesados (Studios/Recovery).

**Segundo: Studios.** Es el que más se beneficia de una identidad propia (boutique premium vende por estética) y donde `reservas`+`packages` ya dan una base; justifica construir `waitlist`+spots. Box viene como tercero porque reaprovecha casi todo lo de Studios + `programas`.

> En una frase: **el motor ya está; la inversión es la capa de configuración + theming (barata) y 2–3 flujos especializados (cara). Empezar por Gym paga la arquitectura con el menor riesgo.**
