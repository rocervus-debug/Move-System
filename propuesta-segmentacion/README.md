# VELUM — Propuesta de segmentación por vertical fitness

Convertir el panel admin único de VELUM en una **plataforma segmentada por nicho**:
un mismo core + backend Supabase + aislamiento por `gym_id`, repintado por vertical
mediante tokens de diseño y módulos configurables. **Misma casa, seis productos.**

## 🚪 Punto de entrada
**[`index.html`](index.html)** — selector de vertical navegable (abre cualquier panel).
Sírvelo desde un servidor estático en esta carpeta y entra por ahí.

## 🗺️ Mapa de la propuesta

### Documentos (`docs/`)
| | Contenido |
|---|---|
| [00 · Auditoría](docs/00-auditoria.md) | **FASE 0** — qué existe hoy (front + Supabase), 38 tablas reales, RLS multi-tenant, edge functions, y el mapa CORE vs acoplado. Incluye hallazgos honestos (p.ej. `waitlist` no existe aún). |
| [01 · Arquitectura](docs/01-arquitectura.md) | **FASE 1–2** — taxonomía de 6 verticales y cómo se logra sin duplicar: core + capa de configuración + sistema de temas + multi-tenant. Esfuerzo por pieza. |
| [02 · Design systems](docs/02-design-systems.md) | **FASE 3** — mini design system por vertical (paleta hex, tipografía, densidad, personalidad). |
| [03 · Viabilidad & roadmap](docs/03-viabilidad-roadmap.md) | **FASE 5** — veredicto, % de reutilización (~70/30), riesgos, roadmap por fases y qué vertical lanzar primero. |

### Mockups navegables (`*.html`) — **FASE 4**
Todos comparten **[`assets/velum-core.css`](assets/velum-core.css)** (un solo CSS, seis temas vía `<body data-vertical="…">`).

| Vertical | Pantallas |
|---|---|
| **Studios** (boutique) | [Dashboard](studios-dashboard.html) · [Calendario+reservas+waitlist+spots](studios-calendario.html) · [Paquetes & créditos](studios-paquetes.html) · [Perfil cliente](studios-cliente.html) · [Instructores & reformers](studios-instructor.html) |
| **Gym** (tradicional) | [Dashboard](gym-dashboard.html) · [Control de acceso](gym-accesos.html) · [Membresías & renovaciones](gym-membresias.html) · [Coaches & PT](gym-coaches.html) · [Perfil socio](gym-cliente.html) |
| **Box** (functional) | [Dashboard + WOD](box-dashboard.html) · [Leaderboard & benchmarks](box-leaderboard.html) |
| **Performance** (Hyrox) | [Dashboard + estaciones](performance-dashboard.html) · [Heats & marcas](performance-heats.html) |
| **Combat** (artes marciales) | [Dashboard](combat-dashboard.html) · [Progresión de cinturones](combat-cinturones.html) |
| **Recovery** (wellness) | [Dashboard](recovery-dashboard.html) · [Citas por recurso & protocolos](recovery-citas.html) |

## 🔑 Idea en una frase
El backend ya gestiona accesos, reservas, créditos y programación para 6 gyms reales.
La segmentación **no reescribe el motor**: agrega una **capa de configuración por vertical**
(módulos + vocabulario) y un **sistema de temas** (8–10 variables CSS). El 70% se reutiliza;
el 30% nuevo son 2–3 flujos especializados. **Recomendación: lanzar Gym primero** (máxima
reutilización, mínimo riesgo) y validar la arquitectura antes de los flujos caros.

## ⚠️ Naturaleza de los mockups
Son **maquetas de la visión** (HTML estático con datos de ejemplo en MXN), no el producto
conectado. Donde una capacidad aún no existe en el sistema real, está dicho en la auditoría
(p.ej. waitlist, asignación de spot, grados, recursos reservables son desarrollo nuevo).
