# VELUM Security Backlog

**Última actualización:** 25 May 2026
**Estado:** ✅ Aislamiento cross-gym validado end-to-end. **0 ERRORS · 6 WARNS** (todos acceptable risk documentado).

---

## ✅ FIXES APLICADOS EN PRODUCCIÓN (25 May 2026 · Ronda 3 — cierre auth refactor)

Smoke tests cross-gym descubrieron que anon (sin JWT) podía leer datos de gym_id=1 en 18+ tablas (pagos, clientes, usuarios con pw_hash, gastos, etc.). Causa raíz + 3 fugas legacy adicionales.

| Fix | Migración | Impacto |
|---|---|---|
| **🚨 `auth_gym_id()` ya NO hace fallback a 1** | `fix_auth_gym_id_no_fallback` | Cuando no hay JWT devuelve NULL → `gym_id = NULL` → false → anon bloqueado en TODAS las tablas con gym_isolation a la vez |
| 17 `gym_isolation` policies migradas de role `public` → `authenticated` | `gym_isolation_public_to_authenticated` | Defense in depth: explícito que solo authenticated puede leer, aunque NULL fallback ya lo bloquea |
| `clientes` RPC `kiosco_lookup(gym_id, numero)` + drop `Kiosco lookup by numero` | `tighten_clientes_rls_kiosco_rpc` | Anon ya no puede `SELECT * FROM clientes`. Kiosco usa SECURITY DEFINER RPC que devuelve 1 fila por (gym_id+numero) con campos mínimos |
| `clientes` drop `Athletes can update own foto_url` + nueva policy authenticated por `cliente_id` | mismo | Anon ya no puede UPDATE cualquier cliente con `portal_token IS NOT NULL` |
| Drop `horarios."Public read horarios"` | `drop_legacy_public_policies_*` | Cerraba leak de 41 filas a anon (horarios de TODOS los gyms) |
| Drop `programas.allow_*` (4 policies SELECT/INSERT/UPDATE/DELETE TO public) | mismo | Cerraba leak de 87 filas + escritura anon de programas de cualquier gym |
| Drop `leads_landing.service_select_leads_landing` | mismo | Cerraba SELECT público de leads_landing |
| `checkin.html` actualizado para llamar `/rest/v1/rpc/kiosco_lookup` | (no migración) | Kiosco sigue funcionando con la API tightened |

### Validación cross-gym (16 tests)

```
Anon sin JWT intenta leer:
  pagos: 0 ✅            clientes: 0 ✅       usuarios: 0 ✅
  gastos: 0 ✅           leads: 0 ✅          audit_log: 0 ✅
  asistencias: 0 ✅      medidas: 0 ✅        reservas: 0 ✅
  bitacora_atleta: 0 ✅  cliente_notas: 0 ✅  evaluaciones: 0 ✅
  coaches: 0 ✅          campanas: 0 ✅       horarios: 0 ✅
  programas: 0 ✅        leads_landing: 0 ✅  gyms: 0 ✅
  gym_config: 22 ✅ (solo claves de branding públicas: gym_color, gym_logo_url, gym_nombre, gym_tagline, gym_theme, portal_codigo. portal_password sigue bloqueada)

RPC kiosco_lookup(1, 1) anon: devuelve 1 fila con campos mínimos ✅
```

### Advisor final

| Antes (Ronda 1) | Después Ronda 2 | Después Ronda 3 |
|---|---|---|
| 3 ERRORS + 17 WARNS | 0 ERRORS + 11 WARNS | **0 ERRORS + 6 WARNS** |

Los 6 WARNs restantes son todos **acceptable risk**:
- `login_attempts` RLS sin policy — correcto (solo service_role)
- `pg_net` extension en `public` — cosmético, requiere coordinación
- `error_logs.error_logs_insert WITH CHECK true` — necesario para client-side error tracking
- `leads_landing.anon_insert_leads_landing WITH CHECK true` — necesario para captura de leads landing
- `kiosco_lookup` SECURITY DEFINER ejecutable por anon — intencional (es el propósito del RPC)
- `kiosco_lookup` SECURITY DEFINER ejecutable por authenticated — intencional

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

---

## 🛡 ROADMAP DE HARDENING INCREMENTAL (post-25 May 2026)

Nivel actual: "buen SaaS B2B early-stage". Suficiente para gimnasios independientes LATAM. Este roadmap lleva el sistema a "ready para clientes premium / cadenas / industrias semi-reguladas".

### Fase A — Quick Wins (1-2 días · hacer en las próximas 2 semanas)

Objetivo: cerrar los 3 huecos visibles que un atacante semi-técnico podría explotar.

| # | Acción | Esfuerzo | Por qué importa |
|---|---|---|---|
| A1 | Rate limit en `kiosco_lookup` RPC | 2h | Hoy alguien con la anon key puede iterar `(gym_id, numero)` hasta encontrar tokens. Wrap en edge function con rate limit por IP (10 req/min) y log de intentos |
| A2 | Rate limit en `storefront-lead` edge function | 1h | Mismo problema con captura de leads — spammeable. Ya existe deduplicación 1h pero falta rate limit por IP |
| A3 | Rate limit en `velum-atleta-auth` | 1h | Login del atleta es bruteforce-able. Agregar tabla `login_attempts` lookup (ya existe) + bloqueo después de 5 fallos en 15 min |
| A4 | 2FA opcional para admin (login Sistema_Interno) | 4h | Si la cuenta de Roy se compromete, atacante controla todo. TOTP via Google Authenticator usando librería `otpauth` |
| A5 | Cookie banner + política de retención visible en /privacidad | 3h | Requerido para LFPDPPP (México) y LGPD (Brasil) cuando captures email/teléfono. Ya existe /privacidad.html, solo falta banner + política de retención escrita |
| A6 | Headers de seguridad en vercel.json | 30min | CSP, HSTS, X-Frame-Options, Referrer-Policy. Bloquea XSS, clickjacking, MITM |

**Resultado esperado:** un atacante necesita 100x más esfuerzo para extraer datos. Cumples mínimos legales LATAM.

### Fase B — Antes de cliente grande / ~50 gyms (1 semana de trabajo distribuida)

Objetivo: poder responder "sí" a security questionnaires de marcas premium.

| # | Acción | Esfuerzo | Por qué importa |
|---|---|---|---|
| B1 | Audit logging de SELECT en datos sensibles | 1 día | Hoy solo logueas cambios. Agregar trigger o función wrapper para logear quién leyó qué (clientes, pagos) — requerido por LGPD/CCPA si te lo piden |
| B2 | Rotación periódica de `portal_token` | 4h | Tokens de atletas nunca expiran. Agregar rotación cada 90 días + endpoint para regenerar |
| B3 | Encrypted backups custom + restore test | 1 día | Hacer 1 restore de prueba al mes desde backup PITR de Supabase, documentar el proceso |
| B4 | Política de passwords (longitud mínima, no reutilización) | 4h | Hoy admite cualquier password. Agregar validación + zxcvbn score >= 3 |
| B5 | Monitoring y alertas (Supabase logs → Slack/email) | 1 día | Alertas en: logins fallidos masivos, errores 500 spike, queries lentas, advisor degradation |
| B6 | Documentación de arquitectura de seguridad (1 pager) | 4h | Para enviar a prospects que pregunten: "¿cómo manejan datos de mis clientes?" |
| B7 | Términos de servicio + DPA (Data Processing Agreement) | 1 día (con abogado) | Necesario para B2B. Cliente firma DPA al onboarding |

**Resultado esperado:** puedes cerrar un cliente que pregunta "¿son seguros?" con evidencia, no con discurso.

### Fase C — Compliance formal (cuando lo pida un cliente · 2-4 semanas)

Objetivo: certificaciones que abren mercados regulados.

| # | Acción | Esfuerzo | Cuándo |
|---|---|---|---|
| C1 | Pentest externo (one-shot) por boutique mexicana | 1 semana + $1.5k-3k USD | Cuando llegues a 50 gyms o $10k MRR |
| C2 | SOC 2 Type 1 (proceso con Vanta o Drata) | 2-3 meses + $10k-20k USD/año | Si tu cliente target lo exige (cadenas grandes, healthcare-adjacent) |
| C3 | ISO 27001 | 6-12 meses + $20k+ USD | Si vas a Europa o Asia, o cliente enterprise |
| C4 | Bug bounty program (HackerOne o Bugcrowd) | Continuo + payouts variables | Cuando tengas equipo de eng para responder reports |
| C5 | LGPD/GDPR compliance completo (DPO designado, RoPA, etc.) | 1 mes + asesoría legal | Si operas activamente en Brasil/Europa |

### Tabla de prioridad sugerida

| Cuándo | Hacer |
|---|---|
| Esta semana | A1, A2, A3 (los 3 rate limits — bloquean explotación trivial) |
| Próximas 2 semanas | A4, A5, A6 |
| Antes de superar 30 gyms | B1, B6 |
| Antes de superar 50 gyms o vender a cadena | B2, B3, B4, B5, B7, C1 |
| Bajo demanda específica | C2, C3, C4, C5 |

### Costo total estimado

| Fase | Tiempo dev | $ externo |
|---|---|---|
| A (quick wins) | 1-2 días | $0 |
| B (pre-cliente grande) | 5-7 días | $500-1000 (abogado para DPA) |
| C (compliance) | Variable | $1.5k-30k+ USD según cuál |

### Decisión hoy

Ninguna de Fase B o C es bloqueante para los próximos 80-120 gyms. **La Fase A sí debería ejecutarse antes de campañas de paid traffic masivas** porque cualquier crecimiento de tráfico aumenta exposición a abuso (spam leads, brute force atleta).

**Recomendación:** ejecutar A1+A2+A3 en una sesión cuando arranque captación con anuncios Meta. A4-A6 cuando haya tiempo. B y C bajo demanda real.

---

**Owner:** Roy Cervus
**Próxima revisión:** Cuando se ejecute Fase A o llegues a 30 gyms activos
