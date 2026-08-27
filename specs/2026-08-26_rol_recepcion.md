# SPEC — Rol "Recepción" (sin visibilidad de dinero)

**Fecha:** 2026-08-26 · **Pipeline:** INTENT → **SPEC** → PLAN → BUILD → VERIFY → RECORD
**Estado:** esperando "va" de Roy

---

## 1. Qué y por qué

Crear un cuarto rol seleccionable, `recepcion`, para el personal de front-desk.
Puede operar el gym al 100% (check-in, reservas, clientes, horario, CRM, **cobrar**)
pero **no ve ningún agregado de dinero**: ingresos, balance, gastos, nómina, revenue,
proyecciones ni depósitos.

**Distinción central:** recepción ve el **pago individual** de un cliente (necesario para
cobrar y saber si está vigente), pero nunca **la suma**. Se oculta el "cuánto hay", no
el "este cliente pagó".

---

## 2. Criterios de aceptación (medibles)

| # | Criterio | Cómo se verifica |
|---|---|---|
| A1 | `recepcion` aparece en los selects de crear y editar usuario | Visual en panel |
| A2 | Un usuario recepción entra al panel y **sobrevive un refresh** (no se desloguea) | Login + F5 en preview |
| A3 | No existen en el sidebar: Revenue, Gastos & Balance, Cobros VELUM, Paquetes, Calendario Vencimientos, Retención | Visual + DOM |
| A4 | Dashboard NO muestra "Ingresos del Mes" ni "Ingresos Totales" (ni el widget móvil) | Visual |
| A5 | Vista Pagos visible y funcional para renovar, pero SIN los KPIs "Ingresos del Mes" y "Proyección Próx. Mes" | Visual |
| A6 | Navegar a mano (`go('revenue')`, botón móvil) NO abre vistas de dinero | Consola del navegador |
| A7 | Con JWT `app_rol='recepcion'`: `select from gastos` → **0 filas**; `select from commission_payouts` → **0 filas** | SQL con claims simulados |
| A8 | Con ese mismo JWT: `select/insert en pagos, clientes, reservas` → **funciona** | SQL con claims simulados |
| A9 | Recepción NO puede leer las filas de otros usuarios de `usuarios` (solo la propia) | SQL con claims simulados |
| A10 | Un usuario `admin` no pierde absolutamente nada | Regresión visual |

---

## 3. Alcance

### SÍ
- `VELUM_Sistema_Interno.html`: opciones de rol, etiquetas, badge CSS, ocultamiento de nav/KPIs, guard en `go()`
- Migración RLS: agregar `recepcion` a las tablas operativas + policy de auto-lectura en `usuarios`

### NO
- No se toca `move-login/index.ts` (`app_rol` ya pasa `usuarios.rol` tal cual)
- No se toca `atleta.html` ni la app nativa
- No se crea un editor de permisos granular (rol fijo, no configurable por gym)
- No se toca el rol `coach` ni `staff` existentes

---

## 4. Diseño

### 4.1 Modelo de roles
`usuarios.rol` es texto libre sin CHECK constraint (verificado en prod) → insertar
`'recepcion'` no falla. `move-login` ya emite `app_rol: user.rol` textualmente, así que
el claim llega solo a RLS. **Cero cambios en edge functions.**

### 4.2 RLS — la decisión clave

El allowlist `['admin','staff','superadmin']` está repetido en **38 policies / 22 tablas**.
No se reescriben todas. Se parte en tres grupos:

**Grupo A — se AGREGA `'recepcion'`** (operación diaria, sin agregados de dinero):
`clientes`, `pagos`, `reservas`, `waitlist`, `citas`, `medidas`, `bitacora_atleta`,
`member_subscriptions`, `leads`, `gym_config`, `protocolos`, `recursos`

**Grupo B — NO se toca → recepción queda denegada por omisión** (aquí vive el dinero):
`gastos`, `commission_payouts`, `storefront_orders`, `storefront_carts`,
`storefront_visits`, `storefront_leads`, `storefront_listings`, `gym_storefront`,
`ia_conversations_public`

**Grupo C — `usuarios`, caso especial:**
La policy actual excluiría a recepción, y el panel relee `usuarios` con `.single()` al
restaurar sesión (línea 25650) → `data=null` → `clearSession()` → **deslogueo en cada F5**.
Se agrega una policy `SELECT` adicional que permite a cualquier usuario autenticado leer
**únicamente su propia fila** (match por `email` del JWT). No otorga escritura ni permite
ver a los demás usuarios del gym.

**Tablas sin policy de rol** (`asistencias`, `horarios`, `coaches`, `evaluaciones`,
`packages`, `visitas`, `solicitudes`, `campanas`, `cliente_notas`, `qr_checkins`…):
filtran solo por `gym_id`, así que recepción ya tiene acceso. No requieren cambio.

> Nota: `packages` y `visitas` contienen precios/revenue pero no tienen gate de rol hoy.
> Sus **vistas** se ocultan en UI; endurecerlas en RLS queda fuera de alcance (afectaría
> a `coach`/`staff` y merece su propia spec).

### 4.3 UI — mecanismo

Se sigue el patrón ya existente de `applyVerticalModules()` (línea 10273), que es como el
sistema ya oculta módulos por vertical:

```js
const ROLE_MODULES = {
  recepcion: {
    hideNav:  ['revenue','gastos','domiciliados','paquetes','calendario-venc','retencion'],
    hideEls:  ['kpi-ingresos-mes','kpi-total-ingresos','mhw-ingresos',
               'pagos-kpi-ingresos','pagos-kpi-proyeccion'],
    blockViews: ['revenue','gastos','domiciliados','paquetes','calendario-venc',
                 'retencion','superadmin','visitas']
  }
};
```

Puntos de invocación (los tres son necesarios):
1. `showApp()` (~9409) — al entrar
2. Final de `applySidebarOrder()` (~20404) — el customizer **reconstruye el `<nav>` desde cero**, así que sin esto el ocultamiento se pierde
3. Guard dentro de `go()` (~11670) — `blockViews` cierra la puerta a los botones del nav móvil y a la consola

Luego `_syncNavSections()` (10300) para colapsar los grupos que quedaron vacíos.

---

## 5. Riesgos y cómo se mitigan

| Riesgo | Mitigación |
|---|---|
| **Deslogueo en refresh** por RLS en `usuarios` | Policy de auto-lectura (Grupo C). Es A2, se prueba explícitamente |
| El customizer de sidebar revive los ítems ocultos | Re-invocar tras `applySidebarOrder()` (punto 2) |
| Botón móvil "Cobrar" abre modal de pago desde cualquier vista | Se **mantiene a propósito** — recepción sí cobra |
| Loaders piden tablas denegadas y muestran ceros silenciosos | Los loaders toleran `[]` sin romper; las vistas ya están ocultas |
| Ocultar UI ≠ seguridad | Por eso va la migración RLS: `gastos` y `commission_payouts` devuelven 0 filas aunque abran devtools |
| Migración rompe a `admin`/`staff` | La migración solo **agrega** un valor al array; nunca quita. A10 lo verifica |

---

## 6. Plan de ejecución

1. Migración `supabase/migrations/20260826_rol_recepcion.sql` (Grupos A y C)
2. **VERIFY en DB** con claims simulados (`begin; set local request.jwt.claims…; rollback;`) — A7, A8, A9, **antes** de aplicar a prod
3. Aplicar migración a prod → **requiere OK explícito de Roy**
4. Cambios de UI en `VELUM_Sistema_Interno.html`
5. `node --check` sobre el JS tocado
6. VERIFY en preview: crear usuario recepción, login, refresh, recorrer el panel (A1–A6, A10)
7. RECORD + ofrecer `git push` solo de los archivos tocados

---

## 7. RESULTADO (2026-08-26)

**Decisiones de Roy:** recepción cobra y ve pagos individuales · bloqueo UI **+** RLS ·
Gastos/nómina ocultos · **acceso completo a `pagos`** (incluye editar/borrar, riesgo
aceptado conscientemente) · Configuración limitada a "Mi Cuenta".

**El security review encontró 16 hallazgos.** La primera versión cubría 6 de ~15 puntos
donde el panel imprime dinero en vistas permitidas. Lo que faltaba y se corrigió:

- Widget **Balance del Mes** (ingresos/egresos/margen/nómina), **Ingresos 6 meses**,
  **Meta del Mes**, **Analítica del negocio** (ticket promedio, planes por revenue)
- **Nómina Quincena** dentro de Horario · columna **LTV alumnos** del reporte por coach
- **Exports** CSV/XLSX de clientes y pagos, y el **Reporte Mensual** (estado de resultados)
- Vista **Configuración** completa (meta de ingresos editable, precios, Stripe, CFDI)
- Chip **"En riesgo: $X"** en Por Vencer

**Dos bugs propios detectados por la revisión, antes de llegar a producción:**

1. El grant a nivel columna omitía `totp_enrolled_at` → habría roto la sección de **2FA
   de todos los roles** con un 403.
2. El ocultamiento se quedaba pegado al cambiar de usuario en la misma pestaña: un admin
   entrando después de recepción perdía KPIs y menús hasta recargar.

**Cambio de mecanismo:** ocultar con `style.display` no bastaba — varios renderers
(`renderGymAnalytics`, `renderGymPulso`) reescriben `display` en cada corrida y
deshacían el ocultamiento solo. Ahora se marca con `[data-role-hidden]` + regla CSS
`!important`, que le gana al inline style, **y** se conserva el `style.display='none'`
para que sigan funcionando `openMasMenu()` y `_syncNavSections()`, que filtran leyéndolo.

**Hallazgo de seguridad preexistente corregido de paso:** el panel hacía `select('*')`
sobre `usuarios`, descargando `pw_hash`, `totp_secret` y `recovery_codes` de todo el
equipo al navegador de cualquier admin. Ahora son columnas explícitas + revoke/grant.

**Evidencia (claims simulados, transacción con rollback, gym 1):**

| Prueba | Recepción | Admin |
|---|---|---|
| `gastos` | 0 filas | 77 ✓ |
| `commission_payouts` / `storefront_orders` | 0 / 0 | — |
| `pagos` | 314 ✓ | 314 ✓ |
| `clientes` | 99 ✓ | 99 ✓ |
| `usuarios` visibles | 1 (la propia, de 10) | 10 ✓ |
| `pw_hash` / `totp_secret` / `select *` | denegado | denegado |
| Query real de `loadSecurityState` (2FA) | funciona | funciona |
| Datos del gym 2 (multi-tenant) | 0 filas | — |
| JWT de atleta con email de usuario | 0 filas | — |

`node --check` OK en los 10 bloques inline.

**Deuda consciente que queda:** `packages` y `visitas` solo filtran por `gym_id` (sin
gate de rol), así que recepción los alcanza por devtools aunque las vistas estén ocultas;
endurecerlas afectaría a `coach`/`staff` y merece su propia spec. Igual que el
"Total pagado" por cliente en el panel de detalle y el presupuesto por campaña
en Marketing — quedan visibles por decisión de alcance.

---

## 8. Preguntas abiertas (resueltas)

1. **`visitas`** (Visitas del Día) muestra "Revenue Visitas Mes". Propongo ocultar la vista
   completa a recepción. ¿O prefieres que la vean sin ese KPI? *(asumo: ocultar)*
2. **`paquetes`** es el catálogo de planes con precios de lista. Recepción podría necesitarlo
   para responder "¿cuánto cuesta el mensual?". Propongo ocultarlo por ahora.
   *(asumo: ocultar — el precio se ve igual al momento de cobrar)*
3. ¿Recepción debe poder **dar de alta clientes nuevos**? Asumo que sí (es front-desk).
