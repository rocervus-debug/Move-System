# VELUM Security Backlog

**Última actualización:** 24 May 2026
**Estado:** En progreso. Bloque crítico cerrado. Pendientes requieren auth refactor.

---

## ✅ FIXES APLICADOS EN PRODUCCIÓN (24 May 2026 · 2 rondas)

### Ronda 1 — Bloqueo crítico
| Fix | Migración | Impacto |
|---|---|---|
| RLS activado en `login_attempts` | `enable_rls_login_attempts` | Anon ya no puede leer/escribir tabla de audit |
| `gyms_activos` view → SECURITY INVOKER | `views_security_invoker` | Respeta permisos del caller |
| `error_summary` view → SECURITY INVOKER | `views_security_invoker` | Respeta permisos del caller |
| 7 funciones con `search_path` fijado | `fix_function_search_path` | Bloquea search_path injection |
| `notify_new_lead` REVOKE EXECUTE público | `revoke_notify_new_lead_public_exec` | Trigger ya no callable via /rest/v1/rpc/ |

### Ronda 2 — Tightening con auth real del admin
| Fix | Migración | Impacto |
|---|---|---|
| `gym_config` split anon/authenticated | `tighten_gym_config_rls` + `tighten_gym_config_split_roles` | **`portal_password` ya NO leíble por anon.** Branding keys públicas siguen accesibles |
| `horario_cancelaciones` RLS habilitado + split | `tighten_horario_cancelaciones` | Anon solo lee. Solo authenticated del gym puede insertar/modificar |
| `packages` policy temporal removida | `tighten_packages_rls` | Solo authenticated del gym puede crear/editar/borrar planes |

**Hallazgo clave Ronda 2:** El admin (`Sistema_Interno.html`) YA implementa auth completa correctamente:
- `move-login` edge function genera JWT firmado con `SUPABASE_JWT_SECRET` (incluye `gym_id`, `role:'authenticated'`)
- `doLogin()` llama `initAuthClient(jwt)` que re-crea el cliente Supabase con `Authorization: Bearer {jwt}`
- Sesión persiste con restore JWT
- Esto permitió tightening sin auth refactor adicional para tablas admin-only

**Resultado advisor:** 3 ERRORS + 17 WARNS → **0 ERRORS + 11 WARNS** (80% de los issues críticos cerrados).

---

## 🟡 PENDIENTES — Requieren AUTH ATLETA REFACTOR

3 tablas siguen vulnerables porque el atleta.html escribe directo con anon key. Para tightenear necesitan que el portal del atleta implemente auth real (no portal_token directo).

| Tabla | Policy actual | Vector de ataque | Plan |
|---|---|---|---|
| `bitacora_atleta` | `bitacora_delete_anon` + `bitacora_insert_anon` (anon true) | Cualquiera borra/escribe bitácoras de cualquier atleta | Tighten con `cliente_id=auth_cliente_id()` post-refactor |
| `medidas` | `atleta_insert_medidas` + `gym_update_medidas` + `gym_delete_medidas` (true) | Cualquiera escribe/modifica/borra medidas de atletas | Tighten con `cliente_id=auth_cliente_id()` post-refactor |
| `reservas` | `insert_reservas` + `update_reservas` (true) | Cualquiera reserva clases a nombre de otros | Tighten con `cliente_id=auth_cliente_id()` post-refactor |

## 🟢 ACCEPTABLE RISK (documentado)

| Tabla | Policy | Justificación |
|---|---|---|
| `leads_landing` | `anon_insert_leads_landing INSERT true` | Captura de leads desde landing pública requiere anon INSERT. SELECT ya tiene tenant policy. Mitigación futura: rate-limit + captcha frontend |
| `error_logs` | `error_logs_insert INSERT true` | Client-side error tracking requiere anon INSERT. SELECT ya tiene tenant policy. Mitigación futura: rate-limit |
| `pg_net` extension en `public` schema | — | Cosmético. Mover a schema dedicado requiere coordinación con edge functions |
| `login_attempts` RLS sin policy | INFO level | Correcto: solo service_role debe acceder. Sin policies = anon/authenticated denied |

---

## 🛠 PLAN DE AUTH REFACTOR (proyecto de 2-3 días)

### Fase 1 — Implementar Supabase Auth en admin (Sistema_Interno.html)

**Estado actual:** El admin loggea con `move-login` edge function que valida contra tabla `usuarios.pw_hash`. La sesión es un token custom en localStorage.

**Cambio:**

1. Migrar `move-login` para que también cree una sesión de Supabase Auth (`supabase.auth.signInWithPassword` o admin invite)
2. Cada usuario en `usuarios` ↔ user en `auth.users` por email
3. Custom claim `gym_id` en el JWT
4. Función helper `auth_gym_id()` retorna el gym_id del JWT actual

```sql
-- Función helper (ya existe parcialmente)
CREATE OR REPLACE FUNCTION public.auth_gym_id()
RETURNS BIGINT
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (auth.jwt() ->> 'gym_id')::BIGINT,
    (SELECT gym_id FROM usuarios WHERE email = auth.email() LIMIT 1)
  );
$$;
```

### Fase 2 — Implementar auth de atleta (atleta.html)

**Estado actual:** El atleta usa `portal_token` en `clientes` table como auth (no es Supabase Auth real).

**Cambio:**

1. Cuando se crea un cliente, también crear `auth.users` entry con email
2. `portal_token` se mantiene como deeplink para magic-link auth de Supabase
3. Función `auth_cliente_id()` retorna `clientes.id` del cliente loggeado

```sql
CREATE OR REPLACE FUNCTION public.auth_cliente_id()
RETURNS BIGINT
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT id FROM clientes WHERE email = auth.email() LIMIT 1;
$$;
```

### Fase 3 — Tightening de policies

Una vez que auth esté implementado, reemplazar las 8 policies vulnerables:

```sql
-- gym_config: solo dueños del gym
DROP POLICY allow_all_gym_config ON gym_config;
CREATE POLICY gym_config_owner_read ON gym_config
  FOR SELECT TO authenticated
  USING (gym_id = auth_gym_id());
CREATE POLICY gym_config_owner_write ON gym_config
  FOR ALL TO authenticated
  USING (gym_id = auth_gym_id())
  WITH CHECK (gym_id = auth_gym_id());

-- bitacora_atleta: solo el atleta dueño escribe; gym owner ve todos los del gym
DROP POLICY bitacora_insert_anon ON bitacora_atleta;
DROP POLICY bitacora_delete_anon ON bitacora_atleta;
CREATE POLICY bitacora_atleta_own ON bitacora_atleta
  FOR ALL TO authenticated
  USING (cliente_id = auth_cliente_id() OR gym_id = auth_gym_id())
  WITH CHECK (cliente_id = auth_cliente_id());

-- medidas, reservas, horario_cancelaciones: patrón similar

-- horario_cancelaciones: enable RLS + tighten
ALTER TABLE horario_cancelaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY horario_canc_select ON horario_cancelaciones
  FOR SELECT TO anon, authenticated USING (true); -- info pública
CREATE POLICY horario_canc_write ON horario_cancelaciones
  FOR ALL TO authenticated
  USING (gym_id::bigint = auth_gym_id())
  WITH CHECK (gym_id::bigint = auth_gym_id());
```

### Fase 4 — Smoke tests cross-gym

Crear cuenta de prueba en gym A, intentar leer/escribir datos de gym B. Debe fallar.

```sql
-- Como user gym A
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims.gym_id TO '1';
SELECT COUNT(*) FROM gym_config WHERE gym_id != 1;  -- debe ser 0
SELECT COUNT(*) FROM bitacora_atleta WHERE gym_id != 1;  -- debe ser 0
RESET ROLE;
```

---

## 🟢 OTROS PENDIENTES (no urgentes)

| Issue | Acción | Cuándo |
|---|---|---|
| `pg_net` extension en schema `public` | Mover a schema dedicado | Después de auth refactor |
| `login_attempts` tiene RLS pero sin policies | Agregar policy explícita "service_role only" | Cosmético, ya está safe |

---

## 📊 Métricas de éxito post-refactor

Después de implementar todo lo anterior:

| Métrica | Target |
|---|---|
| ERRORS en advisor | 0 |
| WARNs en advisor | 0-2 (solo cosméticos como `pg_net`) |
| Tablas con RLS habilitado | 100% del schema public |
| Policies con `USING (true)` write | 0 |
| Tests cross-gym | Todos bloquean acceso a datos de otros gyms |

---

## ⏱ Estimación de esfuerzo

| Fase | Trabajo | Tiempo |
|---|---|---|
| Fase 1: Auth admin | Modificar move-login + JWT con gym_id + testing | 1 día |
| Fase 2: Auth atleta | Magic link via portal_token + auth.users sync | 0.5 día |
| Fase 3: Tighten policies | Reescribir 8 policies + RLS horario_cancelaciones | 0.5 día |
| Fase 4: QA cross-gym | Tests de aislamiento, validación con cuenta real | 0.5 día |
| **TOTAL** | | **2.5 días** |

---

## 🚨 Antes de lanzar FASE 10 (Storefront)

**Recomendación crítica:** Completar Fases 1-3 ANTES de activar Storefront público. Razón: el Storefront va a multiplicar el volumen de datos sensibles (visitor info, transactions, IA conversations) y necesita aislamiento entre gyms validado.

---

**Owner:** Roy Cervus
**Próxima revisión:** Después de implementar Fase 1 del auth refactor
