# FASE 0 — Auditoría del sistema actual

> Auditoría real del código y de la base de datos Supabase (no supuestos).
> Proyecto Supabase: `savzjanpydyjtrgdkllx`. Fecha: junio 2026.

## A) Frontend / panel

- **Un solo archivo:** `VELUM_Sistema_Interno.html` (~23,000 líneas), HTML/CSS/JS **vanilla**, sin framework ni build. Todo el panel admin vive aquí.
- **Otros HTML del producto:** `atleta.html` (PWA del atleta), `checkin.html` (kiosko dedicado), `storefront.html` (tienda pública), `gym-portal.html`, `index.html` (landing). El kiosko y el portal del atleta hablan con Supabase vía edge functions.
- **Design system actual (tokens reales en `:root`):**
  - Acento **cian `#00D4FF`**; fondo navy casi negro `#040C14`; cards `#08121E`.
  - Tipografía: **Inter** (texto), **Outfit** (display), **Geist Mono** (números).
  - `--radius:20px`, sombras suaves, glows cian, modo claro opcional (`body.light-mode`).
  - Estados semánticos: ok `#10E8A0`, warn `#FBBF24`, danger `#F87171`.
- **Componentes:** sidebar fija + topbar + vistas (`.view`/`#v-*`), `.btn` (primary/outline/ghost/danger con loading), `.card`, `.kpi-card` con count-up, `.tbl`, badges, skeletons, `.empty-state`, modales `.modal-*`, command palette (Cmd+K), y el **sistema de wizard `.wzd-*`** (asistentes paso a paso) agregado recientemente.
- **Módulos visibles (nav):** Dashboard · Pagos & Renovaciones · Clientes/CRM · Coaches · Evaluaciones · Horario · Asistencia · Visitas · Gastos · Revenue · Retención · Marketing/Campañas · Programa de entreno · Solicitudes · Configuración (Planes, Storefront, Stripe, Kiosco, Usuarios, Personalización, Suscripción) · Super Admin · Centro de ayuda · Onboarding.
- **Convenciones de producto (skills del proyecto):** FORJA (producto/sistema interno), VITRINA (web pública), NÚCLEO (coordinación), ESCUDO (seguridad/RLS). La marca es **dark premium + acento cian**; multi-tenant primero; "llevar de la mano" al dueño no técnico (de ahí los wizards).

## B) Backend / Supabase

- **38 tablas en `public`.** Conteos reales relevantes: `clientes` 180 · `pagos` 346 · `horarios` 130 · `visitas` 109 · `gastos` 47 · `reservas` 34 · `asistencias` 31 · `packages` 23 · `coaches` 10 · `gyms` 6 · `usuarios` 14 · `gym_config` 42 · `programas` 102 · `config_programas` 384.
- **Multi-tenant ya implementado:** casi toda tabla tiene `gym_id`; RLS con política `gym_isolation` = `is_superadmin() OR gym_id = auth_gym_id()` (USING + WITH CHECK). Helpers SQL: `auth_gym_id()`, `auth_app_rol()`, `is_superadmin()`.
- **Auth custom (no Supabase Auth):** edge function `move-login` firma un JWT propio con claims `app_rol` y `gym_id`. RLS lee esos claims.
- **`gyms` (6 filas) + `gym_config` (key/value por gym, 42 filas) + `velum_saas_plans`** → ya existe la noción de "cada gym es un tenant con su configuración". `gym_config` guarda nombre, logo, colores, tema, código de portal, etc.
- **33 edge functions** (Deno/TS): `move-login`, `move-checkin`, `velum-payment`, `velum-atleta-portal`, `velum-atleta-auth`, `velum-prog-generate`, `velum-coach-ia`, `velum-web-push`, toda la familia `stripe-*` y `storefront-*`, `velum-saas-*`, etc.
- **Storage:** bucket público `storefront-assets` (fotos de coaches, productos).

### Dónde vive la lógica
- **En el backend:** check-in con verificación de membresía y descuento de clases (`move-checkin`), login/JWT, pagos Stripe, generación de programa con IA, rate-limiting (`check_rate_limit` + tabla `rate_limits`), aislamiento por gym (RLS).
- **En el front:** render de todas las vistas, validaciones de UI, los wizards, cálculo de KPIs del dashboard (sobre los arrays cargados), filtros. El front es "grueso"; el backend es la fuente de verdad de datos y de las operaciones sensibles.

## C) Síntesis — ¿qué es reutilizable?

| Módulo / capacidad | Estado | CORE genérico | Acoplado a un giro |
|---|---|---|---|
| Auth custom + JWT + RLS multi-tenant | Maduro | ✅ Sirve a todos | — |
| `clientes` / CRM / leads | Maduro | ✅ | — |
| `pagos` + `packages` (créditos, ilimitado, duración, Stripe) | Maduro | ✅ Base de cobro | `num_classes`/`unlimited_classes` ya habilitan **créditos boutique** |
| `gastos`, Revenue, Retención, dashboard, reporting | Maduro | ✅ | — |
| `coaches` + `usuarios` (roles) | Maduro | ✅ Staff | Vocabulario cambia (coach/instructor/sensei) |
| `gym_config` (config por tenant) | Maduro | ✅ **Aquí enchufa el theming por vertical** | — |
| Storefront público + Stripe | Maduro | ✅ | — |
| `horarios` (día/hora/tipo/cupo/coach) | Maduro | Parcial | Es la base del **class-based** (Studios/Box/Combat) |
| `reservas` (horario_id, cliente, fecha, estado) | **Existe (34)** | — | **Class-based**: reservar clase ya funciona en backend |
| `asistencias` + `qr_checkins` + kiosko | Maduro | ✅ Accesos | Eje de **Gym tradicional** |
| `programas` + `config_programas` (WOD/contenido + IA) | Maduro | — | Eje de **Box/Performance** (programación) |
| `evaluaciones`, `medidas`, `bitacora_atleta` | Existe (poco uso) | Parcial | Assessments / progreso (Performance/Recovery) |
| **`waitlist`** | ⚠️ **NO existe como tabla** | — | El código (`checkin.html`, panel) la referencia pero la tabla falta → las **listas de espera no funcionan hoy** |

### Conclusión de la auditoría
El sistema **no es un panel de gym tradicional disfrazado**: ya carga, en el backend, las tres mecánicas que definen a las verticales —**accesos** (gym), **reservas de clase + créditos** (boutique/box), y **programación** (box/performance)—. Lo que falta no es el motor, sino **(1) una capa de configuración por vertical** que prenda/apague módulos y cambie vocabulario, **(2) el sistema de temas** intercambiables, y **(3) completar piezas** como `waitlist`, asignación de spot/reformer, y la programación por estaciones (Hyrox) o por grados (Combat).

→ El mapa de reutilización y el % estimado están en [`03-viabilidad-roadmap.md`](03-viabilidad-roadmap.md).
