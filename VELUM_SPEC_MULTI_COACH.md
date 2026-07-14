# SPEC: Múltiples coaches por clase + nómina por cabeza

**Qué**: permitir asignar varios coaches a una misma clase del horario, y que la nómina
le pague la clase-hora a **cada** coach asignado (no solo a uno).

**Por qué / problema real**: Gold Padel (academias de padel = clases de CORE) da clases
con **4 coaches por hora**. Hoy `horarios` guarda UN solo coach por clase, así que (a) no
puede registrar el equipo real que dio la clase y (b) la nómina solo le paga a ese uno —
los otros 3 quedan sin cobrar. Es un hueco de CORE, no un tema de vertical: le sirve a
cualquier gym que enseñe en equipo. **No se cambia la vertical.**

## Criterios de aceptación (medibles)
1. Al crear/editar una clase (plantilla semanal y override de un día) se pueden asignar
   **1 a N coaches**; el primero es el "principal" y se guarda en `coach_id`/`coach_nombre`
   como hoy (compatibilidad total con lo existente).
2. La nómina de quincena cuenta esa clase-hora para **cada** coach asignado y la multiplica
   por **su propia tarifa** (`coach_tarifas`). Un club con 4 coaches en una clase genera 4
   líneas de pago, una por coach.
3. **Cero regresión**: toda clase existente (1 coach) sigue viéndose y pagándose igual; el
   panel, el storefront y la app del atleta que hoy leen `coach_nombre` siguen mostrando al
   principal aunque no se actualicen.
4. Aislamiento intacto: la clase y sus coaches viven bajo el mismo `gym_id`; el gym B nunca
   ve ni paga coaches del gym A (RLS de `horarios` sin cambios).

## Alcance
- **SÍ incluye**: columna nueva para coaches adicionales, multi-select de coaches en el
  modal de clase (plantilla + override), y ajuste de `countForCoach`/nómina para pagar por
  cabeza. Mostrar el equipo completo en la vista pública/app del atleta.
- **NO incluye**: repartir el pago (cada coach cobra la clase completa a su tarifa, no una
  fracción — es lo que Gold Padel hace); tarifas distintas por rol dentro de la misma clase
  (todos usan su tarifa mensual actual); reservas/cupo (el cupo es de la clase, no cambia).

## Toca (verificado en código/DB)
- **DB**: `horarios` — hoy `coach_id text NOT NULL`, `coach_nombre text NOT NULL`, sin
  soporte multi. Migración: `add column coaches_extra jsonb` (nullable) con
  `[{id,nombre},…]` de los coaches adicionales. **Sin backfill** (filas viejas = null =
  solo principal). RLS de `horarios` sin tocar (mismo `gym_id`).
- **Panel** `VELUM_Sistema_Interno.html`: modal de clase (plantilla `saveClase` ~23770 +
  override ~23657 + alta masiva ~24233) → multi-select de coaches; grid mensual muestra el
  equipo; `countForCoach`/`renderQuincenaKPI` (~23966) cuenta principal **+** `coaches_extra`.
- **Público/App**: `storefront-config` (desplegada v16, expone `coach_nombre` por slot) y
  `atleta.html` → mostrar lista de coaches (fase 2; la app entra en la próxima build).

**Agentes**: FORJA construye (panel+migración) · CAUDAL revisa la nómina (lo pagado =
lo trabajado) · CENTINELA verifica regresión y multi-tenant · ESCUDO valida que la
migración no abra la RLS.

## Riesgos y cómo se mitigan
- **Romper los 51 lectores de `coach_nombre`** → se conserva `coach_id`/`coach_nombre` como
  principal; `coaches_extra` es aditivo. Nadie que lea el principal se rompe.
- **jsonb vs tabla puente** → se elige `coaches_extra jsonb` (no tabla nueva) porque
  `horarios` es de lectura muy pesada y ya guarda arrays así (p.ej. `dias_semana` en
  `config_programas`); una tabla puente obligaría a re-cablear todas las queries y una RLS
  nueva. Trade-off aceptado: menos "normalizado", mucho menos superficie de cambio.
- **Coach borrado deja id/nombre viejo en `coaches_extra`** → mismo comportamiento que hoy
  con `coach_nombre` denormalizado; la nómina cruza por `coach.id` vivo, los huérfanos no
  suman.
- **Doble conteo si el principal también aparece en extras** → al guardar se deduplica por
  `coach_id` (el principal nunca se repite en `coaches_extra`).

## Decisiones (confirmadas por Roy 2026-07-14)
1. **Pago completo por coach**: cada coach de la clase cobra la clase-hora **completa** a su
   tarifa. 4 coaches en una clase = 4 pagos completos. NO se prorratea.
2. **Nómina igual que hoy**: se conserva el cálculo quincenal actual (`countForCoach` ×
   tarifa del coach), y el monto por clase lo configura el admin como ya se hace hoy
   (`coach_tarifas` por coach/mes). Sin tarifas por disciplina/nivel — fuera de alcance.
3. **Sin jerarquía**: los coaches de una clase son un equipo de iguales; en la UI se
   presentan sin rango. El `coach_id`/`coach_nombre` "principal" se conserva SOLO como
   ancla técnica de compatibilidad (los 51 lectores existentes), no como rol visible.

Idea completa — sin preguntas abiertas.

**Estimación**: M · **Verificación**: `apply_migration` en rama + `node --check` + preview
con evidencia (clase con 3 coaches → nómina con 3 líneas completas) + claims de gym B (no ve
la clase ni la nómina del gym A) + regresión de una clase de 1 coach (paga igual que antes).
