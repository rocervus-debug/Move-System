# Auditoría RLS de escrituras — patrón "solo gym_id" (2026-10-01)

**Origen:** P0 de `gyms_update` (ya cerrado). Se buscó el mismo patrón en TODAS las policies
INSERT/UPDATE/DELETE/ALL de `public`: condición `is_superadmin() OR gym_id = auth_gym_id()` sin
`auth_app_rol()`. El JWT de atleta (`velum-atleta-auth`) trae `gym_id`, y la contraseña del portal es
una sola por gym → cualquier socio (o quien la conozca) obtiene ese JWT.

**Estado:** ✔ APLICADO en producción el 2026-10-01 ~20:05 UTC con OK de Roy (migración `rls_escrituras_por_rol`).
Matriz atleta/admin/recepción/coach/superadmin re-corrida contra producción después de aplicar: verde.
Fix: [`supabase/migrations/20261001_rls_escrituras_por_rol.sql`](supabase/migrations/20261001_rls_escrituras_por_rol.sql)

## Método

- `pg_policies` completo (67 policies de escritura). 17 tablas con el patrón vulnerable.
- Pruebas como atleta: `set role authenticated` + `request.jwt.claims` de atleta de COREX (gym 29),
  primero con las claims mínimas del brief y luego con las claims reales que firma `velum-atleta-auth`
  (`cliente_id`, `portal_token`, `qr_token`). Todo en transacción con rollback (o excepción forzada);
  verificado después que producción quedó intacta.
- Control cruzado: el mismo atleta contra gym 37 → 0 filas (el aislamiento entre gyms sí aguanta;
  el hueco es de **rol dentro del gym**).

## Tablas vulnerables (con evidencia)

| Sev | Tabla | Qué hizo el atleta de COREX | Impacto |
|---|---|---|---|
| **P0** | `packages` | UPDATE 7 paquetes activos a `price_mxn=1` (y a $10 × 3650 días con claims reales); INSERT paquete activo $1 × 365 días | `stripe-checkout-create` y `velum-member-subscription` cobran `packages.price_mxn` → membresía anual por $10 (mínimo de Stripe) sobre un paquete publicado |
| **P0** | `gym_config` | UPDATE `portal_codigo` → "PWNED"; INSERT `flag_*`; DELETE 6 filas de config (branding, sf_*, vertical…) | Cambiar el código deja a TODOS los socios sin poder entrar a la app; flags cambian piel/vocabulario/waitlist. `portal_password` NO fue alcanzable (la policy SELECT lo oculta y UPDATE/DELETE necesitan verlo) |
| **P0** | `audit_log` | DELETE 211 filas (toda la bitácora del gym); SELECT de las 211 | Borra el rastro de quién hizo qué — justo lo que se usaría para investigar los demás abusos |
| **P1** | `horarios` | UPDATE `cupo=0` en 189 clases; DELETE 189 (todas) | Calendario del gym desaparece / nadie puede reservar |
| **P1** | `horario_cancelaciones` | INSERT (cancelar cualquier clase); DELETE 98 (reabrir todas las canceladas) | Clases fantasma o canceladas a voluntad |
| **P1** | `coaches` | UPDATE email + `usuario_id=null` en 5; DELETE 5; SELECT email/tel de todos | Rompe el vínculo de `coach_mis_clases` y la nómina; fuga de datos de contacto del staff |
| **P1** | `visitas` | INSERT visita de $99,999 | Ingresos falsos en reportes (dinero) |
| **P1** | `asistencias` | INSERT asistencia falsa; DELETE 35; SELECT de todos los socios | Historial de asistencia manipulable y legible por cualquier socio |
| **P2** | `cliente_notas`, `evaluaciones` | INSERT OK; SELECT abierto | Notas privadas y peso/altura de TODOS los socios legibles por un socio (COREX tiene 0 filas; otros gyms no) |
| **P2** | `programas`, `config_programas`, `contenidos`, `campanas`, `solicitudes`, `qr_checkins` | UPDATE/INSERT OK | Vandalismo de contenido interno; `campanas` expone presupuesto |
| **P1** | `clientes` (fila propia) | UPDATE `stripe_customer_id`, `numero_cliente=99999`, `nombre`, `qr_token` | `numero_cliente` no es único → copiar el número de otro socio rompe su login (`.single()` con 2 filas) |
| **P2** | `reservas` (fila propia) | UPDATE `estado='asistio'` (se marca asistencia solo); UPDATE `gym_id=37` → la reserva **aparece en otro gym** | Escritura cruzada entre gyms: las policies UPDATE no tienen WITH CHECK y reusan el USING (`cliente_id = propio`), que no ata `gym_id`. Mismo patrón en `waitlist`, `citas`, `medidas`, `bitacora_atleta` |

**Extra — mismo hueco de rol, vía RPC:** `clases_baja_ocupacion(p_gym_id)` es `security definer`, recibe
el gym por parámetro y no valida nada. El atleta de COREX pidió gym 30 y obtuvo **3 filas con nombre
de cliente, pago, plan y vencimiento de otro negocio**. Fuga entre gyms (P1).

**Coach:** el rol `coach` del panel pasa exactamente las mismas policies: con su JWT cambió 7 precios,
el código del portal, borró 211 filas de bitácora y tocó 194 clases.

### Lo que sí está bien (probado como atleta → 0 filas / RLS error)

`gym_storefront`, `storefront_listings`, `storefront_leads`, `payment_links`, `coach_tarifas`,
`nomina_tabulador`, `pagos`, `member_subscriptions`, `usuarios`, `gastos`, `leads`, `protocolos`,
`recursos`, `clientes` ajenos, `gyms`. Las tablas `saas_*`, `gym_notes`, `velum_gym_backups` son solo
superadmin. Las vistas `gyms_activos` / `error_summary` son `security_invoker` (no saltan RLS).

## Fix propuesto (por niveles)

Quién escribe qué se sacó por grep de `VELUM_Sistema_Interno.html` y `atleta.html`:

- `atleta.html` escribe directo solo en: `clientes` (`foto_url`, `web_push_subscription`), `reservas`
  (insert, `spot`, `estado='cancelado'`), `waitlist` (insert, `estado='cancelado'`), `medidas`,
  `bitacora_atleta`, `error_logs`. Lee directo `horarios`, `horario_cancelaciones`, `gym_config` (branding).
  Nada más — lo demás pasa por edge functions con service role.
- El panel escribe `gym_config` solo desde pantallas de Configuración/superadmin (`saveGymConfig`,
  `saveGymFlags`, `savePadelSetup`, `saveObConfig`, `saCreateGym*`); `packages` desde la vista Paquetes
  (vetada a recepción) **y** desde `_paqueteCortesia()` (botón "Llegó" de un prospecto, que puede pulsar recepción).

| Nivel | Tablas | Regla nueva |
|---|---|---|
| A — config y dinero | `gym_config`, `packages` | Escribir: `admin/staff/superadmin`. Excepción angosta: recepción puede INSERT del paquete de cortesía ($0, inactivo, interno). SELECT sin cambios |
| B — operación | `horarios`, `horario_cancelaciones`, `coaches`, `asistencias`, `visitas`, `evaluaciones`, `cliente_notas`, `programas`, `config_programas`, `contenidos`, `campanas`, `solicitudes`, `qr_checkins` | Cualquier rol del panel (`admin, staff, superadmin, recepcion, coach, marketing, operaciones`). El atleta conserva solo SELECT de `horarios` (y el SELECT público de cancelaciones que ya existía) |
| C — bitácora | `audit_log` | INSERT/SELECT panel; UPDATE/DELETE solo superadmin (append-only) |
| D — filas propias del atleta | `clientes`, `reservas`, `waitlist`, `citas`, `medidas`, `bitacora_atleta` | Trigger `guard_atleta_update` (solo actúa si `app_rol='atleta'`): lista blanca de columnas por tabla, `gym_id`/`cliente_id`/tokens inmutables, y en reservas/waitlist solo puede pasar a `cancelado` |
| RPC | `clases_baja_ocupacion` | Mismo cuerpo + candado: `p_gym_id = auth_gym_id()` y rol de panel, o superadmin |

### Prueba del fix (en transacción, revertida)

```
[ATLETA]     packages 0 · gym_config upd 0 / ins BLOQ / del 0 · horarios lee 203, upd 0, del 0
             cancelaciones ins BLOQ · coaches lee 0 · audit_log del 0 · visitas ins BLOQ
             clientes foto OK, web_push OK, stripe/numero/nombre BLOQ
             reservas spot OK, cancelar OK, asistio BLOQ, gym→37 BLOQ
             waitlist alta OK, salir OK, reactivar BLOQ, gym→37 BLOQ · medidas alta OK, gym→37 BLOQ
             clases_baja_ocupacion(gym 30) = 0
[ADMIN]      packages upd 8 / ins OK · gym_config upd 9 / upsert OK · horarios 203 · audit ins OK, del 0
             reservas asistio OK · clientes upd OK · baja_ocupacion propio OK(2), gym 30 = 0
[RECEPCION]  packages upd 0 · cortesía ins OK · paquete activo BLOQ · gym_config 0 · horarios 203
             cancelaciones/visitas/asistencias/audit ins OK · baja_ocupacion propio OK
[COACH]      packages 0 · gym_config 0 · horarios 203 · evaluaciones ins OK · audit del 0
[SUPERADMIN] packages 10 · audit lee 213 · baja_ocupacion gym 30 = 3 (sigue viendo todo)
```

La primera corrida cazó un bug del propio fix: el trigger rompía la subida de foto del atleta
(`record "new" has no field "estado"` — plpgsql resuelve `new.estado` aunque la tabla sea `clientes`).
Corregido leyendo `estado` vía `to_jsonb(new)`; la segunda corrida quedó verde.

## Riesgos del fix / qué vigilar tras aplicar

1. **Roles de panel fuera de la lista.** Si algún usuario tiene un `rol` no listado, pierde escritura
   operativa. Hoy en DB solo existen `admin, coach, recepcion, superadmin` — cubiertos.
2. **Coach pierde config y precios.** Intencional ("horario y evaluaciones"), pero si algún gym usa al
   coach como admin de facto, va a notar que ya no guarda Configuración.
3. **Lecturas que se cierran al atleta:** `coaches`, `asistencias`, `audit_log`, `evaluaciones`,
   `cliente_notas`, `programas`, etc. `atleta.html` no las lee directo (grep), pero conviene un smoke
   test de la app en device (reservar, cancelar, waitlist, foto, medidas, bitácora) tras aplicar.
4. Las DDL toman lock breve en tablas vivas (COREX estaba creando clases durante la auditoría):
   aplicar en hora baja.

## Hallazgos laterales (no se tocaron)

- `supabase/functions/velum-atleta-checkout` (local) lee `stripe_account_id` y `planes_portal` de
  `gym_config` — con el hueco actual un atleta podía insertar esa llave. **No está desplegada**
  (verificado: `Function not found`). No desplegarla nunca así; candidata a borrarse del repo.
- El login del portal busca el código con `ilike(value, gym_codigo)`: el input del usuario es el
  *patrón*, así que `%` o `_` funcionan como comodines. No probado; revisar en `velum-atleta-auth` y
  `velum-atleta-portal` (usar `eq` sobre `lower()`).
- `atleta.html` hace PATCH a `clientes` con `meta_semanal`/`objetivo` (columnas que no existen) y con
  `web_push_subscription` usando la ANON key (RLS lo rechaza): ambos fallan en silencio hoy.
- Las policies mencionan rol `staff`, que no existe en `usuarios`; `marketing`/`operaciones` existen en
  el selector del panel pero no en las policies de `pagos`/`leads`. Unificar listas en una fase aparte.
