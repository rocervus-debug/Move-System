# Plan de Migración · Modelo de Pagos VELUM

**Fecha de creación:** 22 Mayo 2026
**Schema target:** v2 (`VELUM_STOREFRONT_SCHEMA_V2.sql`)
**Riesgo:** ALTO — toca datos financieros en producción
**Reversibilidad:** Completa si se sigue el playbook

---

## 1. Por qué este cambio

El modelo anterior de pagos permitía:
- Pagos sin `package_id` (no se sabía qué se vendía)
- Descuentos sin razón (analytics imposibles)
- Pagos parciales mezclados con pagos totales (inconsistencia)
- Storefront sales separadas del catálogo admin (riesgo de desync)

El modelo v2 corrige todo eso con:
- `package_id NOT NULL` en cada pago nuevo
- `discount_type` enum + `discount_note` opcional
- Sin pagos parciales (decisión Roy 22/May/2026)
- `pagos` tabla unificada para admin + storefront + app

---

## 2. Pre-requisitos antes del cutover

### 2.1 Backups

```bash
# 1. Backup completo via Supabase CLI
supabase db dump --linked --file backup_pre_v2_$(date +%Y%m%d).sql

# 2. Subir backup a 2 ubicaciones independientes
# (S3, Google Drive, disco externo encriptado)

# 3. Probar restore en ambiente staging
supabase db reset --linked --file backup_pre_v2_$(date +%Y%m%d).sql
```

### 2.2 Validar estado actual

Ejecuta este reporte ANTES de la migración para saber el universo:

```sql
-- Cuántos pagos existen y de qué tipo
SELECT
  COUNT(*) AS total_pagos,
  COUNT(*) FILTER (WHERE package_id IS NULL) AS sin_package,
  COUNT(*) FILTER (WHERE package_id IS NOT NULL) AS con_package,
  MIN(created_at) AS oldest,
  MAX(created_at) AS newest
FROM pagos;

-- Pagos por gym (verificar distribución)
SELECT gym_id, COUNT(*) AS pagos
FROM pagos
GROUP BY gym_id
ORDER BY pagos DESC;

-- Pagos con monto = 0 o negativos (anomalías)
SELECT id, gym_id, cliente_id, paid_at, applied_price_mxn
FROM pagos
WHERE applied_price_mxn <= 0
LIMIT 50;
```

Guarda estos números. Después del cutover deben coincidir EXACTAMENTE con la suma de `is_legacy + is_legacy=false`.

### 2.3 Notificar a stakeholders

- Comunicar a founding gyms 48h antes
- Pausar workflows que insertan pagos (cron jobs, edge functions)
- Confirmar que no hay deployments en cola

### 2.4 Ventana de mantenimiento

Recomendado: **martes o miércoles 11pm-1am hora CDMX**. Por qué:
- Tráfico mínimo (sin clases activas en boxes)
- Si algo falla, hay 48h hábiles para corregir
- Storefront todavía no está en producción, así que no hay impacto público

---

## 3. Cutover · Playbook paso a paso

**Duración estimada:** 30-45 minutos
**Personas requeridas:** Mínimo 1 (tú o dev). Recomendado: 2 para validación cruzada.

### Paso 1 · Snapshot transaccional (2 min)

```sql
-- Crear tabla shadow para validación
CREATE TABLE pagos_pre_v2_snapshot AS
SELECT * FROM pagos;

-- Verificar count
SELECT COUNT(*) FROM pagos_pre_v2_snapshot;
```

Esta tabla es tu "punto de no retorno controlado". Si algo se rompe, restauras desde aquí.

### Paso 2 · Aplicar extensión a packages (1 min)

```sql
ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS is_active        BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS internal_only    BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_discount   BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS max_discount_pct NUMERIC(5,2) DEFAULT 100.00;
```

### Paso 3 · Migrar pagos viejos a legacy (3 min)

```sql
-- 3a. Agregar columna is_legacy
ALTER TABLE pagos
  ADD COLUMN IF NOT EXISTS is_legacy BOOLEAN DEFAULT false;

-- 3b. Marcar TODOS los pagos existentes como legacy
UPDATE pagos
SET is_legacy = true
WHERE created_at < CURRENT_TIMESTAMP;  -- toma TODO lo que existía antes

-- 3c. Verificar
SELECT
  COUNT(*) FILTER (WHERE is_legacy = true) AS legacy_marked,
  COUNT(*) FILTER (WHERE is_legacy = false) AS new_pagos,
  (SELECT COUNT(*) FROM pagos_pre_v2_snapshot) AS expected
FROM pagos;
-- legacy_marked debe == expected. new_pagos debe == 0.
```

**Si los counts no coinciden, ABORTAR** y restaurar desde snapshot.

### Paso 4 · Agregar columnas nuevas a pagos (5 min)

```sql
-- Solo agregar columnas que faltan. Las existentes no se tocan.
ALTER TABLE pagos
  ADD COLUMN IF NOT EXISTS list_price_mxn       INTEGER,
  ADD COLUMN IF NOT EXISTS applied_price_mxn    INTEGER,
  ADD COLUMN IF NOT EXISTS discount_type        TEXT,
  ADD COLUMN IF NOT EXISTS discount_note        TEXT,
  ADD COLUMN IF NOT EXISTS source               TEXT DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS cart_id              UUID,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_charge_id     TEXT,
  ADD COLUMN IF NOT EXISTS stripe_customer_id   TEXT,
  ADD COLUMN IF NOT EXISTS stripe_fee_mxn       INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS velum_commission_mxn INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_to_gym_mxn       INTEGER,
  ADD COLUMN IF NOT EXISTS refund_reason        TEXT;

-- 4a. Backfill list_price_mxn y applied_price_mxn para legacy
UPDATE pagos
SET list_price_mxn = COALESCE(monto, applied_amount, amount, 0),
    applied_price_mxn = COALESCE(monto, applied_amount, amount, 0)
WHERE is_legacy = true AND list_price_mxn IS NULL;
-- Ajusta los nombres de columnas según tu esquema actual.
```

### Paso 5 · Aplicar constraints (CRÍTICO · 3 min)

```sql
-- Constraint que enforce package obligatorio (solo para nuevos)
ALTER TABLE pagos
  ADD CONSTRAINT pago_requires_package
  CHECK (is_legacy = true OR package_id IS NOT NULL);

-- Constraint que enforce motivo de descuento
ALTER TABLE pagos
  ADD CONSTRAINT discount_requires_reason
  CHECK (
    applied_price_mxn = list_price_mxn
    OR (applied_price_mxn < list_price_mxn AND discount_type IS NOT NULL)
    OR is_legacy = true
  );

-- Constraint que applied <= list (nunca cobrar más del listado)
ALTER TABLE pagos
  ADD CONSTRAINT applied_lte_list
  CHECK (applied_price_mxn <= list_price_mxn OR is_legacy = true);
```

### Paso 6 · Crear nuevas tablas Storefront (5 min)

Ejecutar las secciones 2, 3, 5, 6, 7 del archivo `VELUM_STOREFRONT_SCHEMA_V2.sql`:

```sql
-- (Copiar/pegar las CREATE TABLE de:)
-- - gym_storefront
-- - storefront_listings
-- - storefront_carts
-- - storefront_visits
-- - ia_conversations_public
-- - commission_payouts
```

### Paso 7 · Triggers y funciones (3 min)

Ejecutar la sección 9 del schema v2:

```sql
-- snapshot_package_price()
-- validate_max_discount()
-- trigger_set_updated_at()
-- mark_abandoned_carts()
-- calc_velum_commission()
```

### Paso 8 · RLS Policies (2 min)

Ejecutar la sección 7 del schema v2. CRÍTICO. Cada política debe aplicarse o el aislamiento entre gyms no funciona.

### Paso 9 · Views (1 min)

Ejecutar la sección 10 del schema v2:

```sql
-- v_revenue_por_paquete
-- v_descuentos_por_razon
-- v_storefront_funnel
-- v_ia_conversion
-- v_cohorte_por_paquete_inicial
```

### Paso 10 · Smoke test (10 min)

```sql
-- TEST 1: Insertar un pago válido (admin, sin descuento)
INSERT INTO pagos (
  gym_id, cliente_id, package_id,
  list_price_mxn, applied_price_mxn,
  payment_method, source, paid_at
) VALUES (
  '<gym_uuid>', '<cliente_uuid>', '<package_uuid>',
  1500, 1500, 'efectivo', 'admin', now()
);
-- Debe insertar OK

-- TEST 2: Insertar pago sin package_id (debe FALLAR)
INSERT INTO pagos (
  gym_id, cliente_id,
  list_price_mxn, applied_price_mxn,
  payment_method, source
) VALUES (
  '<gym_uuid>', '<cliente_uuid>',
  500, 500, 'efectivo', 'admin'
);
-- Debe ERROR: pago_requires_package CHECK constraint

-- TEST 3: Insertar pago con descuento SIN motivo (debe FALLAR)
INSERT INTO pagos (
  gym_id, cliente_id, package_id,
  list_price_mxn, applied_price_mxn,
  payment_method, source
) VALUES (
  '<gym_uuid>', '<cliente_uuid>', '<package_uuid>',
  1500, 1200, 'efectivo', 'admin'
);
-- Debe ERROR: discount_requires_reason CHECK constraint

-- TEST 4: Insertar pago con descuento Y motivo (OK)
INSERT INTO pagos (
  gym_id, cliente_id, package_id,
  list_price_mxn, applied_price_mxn,
  discount_type, payment_method, source
) VALUES (
  '<gym_uuid>', '<cliente_uuid>', '<package_uuid>',
  1500, 1200, 'referido', 'efectivo', 'admin'
);
-- Debe insertar OK

-- TEST 5: RLS - verificar aislamiento entre gyms
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims.sub TO '<user_id_de_otro_gym>';
SELECT COUNT(*) FROM pagos WHERE gym_id = '<gym_uuid_principal>';
-- Debe retornar 0 (RLS bloqueó)
RESET ROLE;
```

**Si CUALQUIER test falla, ABORTAR migración** y proceder al rollback (paso 12).

### Paso 11 · Limpiar y desbloquear (2 min)

```sql
-- 11a. Verificar counts finales
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE is_legacy = true) AS legacy,
  COUNT(*) FILTER (WHERE is_legacy = false) AS new_after_cutover
FROM pagos;

-- 11b. Tagear timestamp del cutover
INSERT INTO migrations_log (name, applied_at, notes)
VALUES (
  'schema_v2_pagos_storefront',
  now(),
  'Cutover Roy 22May2026. Legacy: ' || (SELECT COUNT(*) FROM pagos WHERE is_legacy = true)
);
-- Si no existe la tabla migrations_log:
-- CREATE TABLE migrations_log (id UUID DEFAULT gen_random_uuid() PRIMARY KEY, name TEXT, applied_at TIMESTAMPTZ, notes TEXT);

-- 11c. Re-habilitar workflows pausados
-- (Reactivar cron jobs, edge functions, etc.)
```

---

## 4. Validación post-cutover (primeras 24h)

### 4.1 Query de salud del sistema

Correr cada 4 horas durante 24h:

```sql
-- Health check
SELECT
  (SELECT COUNT(*) FROM pagos WHERE is_legacy = false) AS new_pagos_24h,
  (SELECT COUNT(*) FROM pagos WHERE is_legacy = false AND package_id IS NULL) AS broken,
  (SELECT COUNT(*) FROM pagos WHERE is_legacy = false
    AND applied_price_mxn < list_price_mxn
    AND discount_type IS NULL) AS discount_sin_motivo;
-- broken debe == 0
-- discount_sin_motivo debe == 0
```

Si cualquier número distinto a 0, hay un bug en la app (alguien está bypass-eando los constraints — no debería ser posible pero por si acaso).

### 4.2 Monitorear inserts por source

```sql
SELECT source, COUNT(*) AS pagos_24h
FROM pagos
WHERE is_legacy = false
  AND created_at > now() - INTERVAL '24 hours'
GROUP BY source;
```

Esperado en MVP (sin storefront aún en prod):
- `admin`: alto volumen
- `app`: cero o muy bajo
- `storefront`: cero hasta lanzamiento FASE 10

### 4.3 Validar reportes nuevos

```sql
-- ¿Funciona la vista revenue por paquete?
SELECT * FROM v_revenue_por_paquete WHERE gym_id = '<gym_uuid>';

-- ¿Funciona descuentos por razón?
SELECT * FROM v_descuentos_por_razon WHERE gym_id = '<gym_uuid>';
```

Ambas deben retornar datos (al menos los pagos nuevos post-cutover) sin errores.

---

## 5. Plan de rollback (si todo se rompe)

### Escenario A — Falla durante el cutover (paso 1-10)

```sql
-- 1. Restaurar pagos desde snapshot
DROP TABLE pagos;
ALTER TABLE pagos_pre_v2_snapshot RENAME TO pagos;

-- 2. Reaplicar índices y constraints originales (del backup)

-- 3. Eliminar tablas nuevas que se crearon
DROP TABLE storefront_listings CASCADE;
DROP TABLE storefront_carts CASCADE;
DROP TABLE storefront_visits CASCADE;
DROP TABLE ia_conversations_public CASCADE;
DROP TABLE commission_payouts CASCADE;
DROP TABLE gym_storefront CASCADE;

-- 4. Reactivar workflows
```

**Tiempo de rollback: <10 minutos** si se sigue el orden.

### Escenario B — Bug descubierto post-cutover (días después)

NO se restaura. Se fix forward:

1. Identificar la query/app que causa el problema
2. Hot-fix en producción
3. Si afecta integridad financiera, considerar refund manual a clientes afectados
4. Documentar el incident report

**No se hace rollback si ya hay pagos nuevos creados** porque perderías esos datos.

---

## 6. Comunicación con founding gyms

### Mensaje pre-cutover (48h antes)

```
Hola [Nombre],

Mañana en la noche (martes 11pm-1am hora CDMX) vamos a hacer una
mejora estructural a VELUM. La plataforma seguirá funcionando, pero
queremos avisarte que:

✓ Los pagos viejos (antes de mañana) siguen visibles tal como están
✓ Los pagos NUEVOS (desde el miércoles AM) van a estar vinculados a un
  paquete específico de tu catálogo
✓ Si das descuentos, ahora se registra el motivo (efectivo, lealtad,
  referido, etc) para que veas reportes precisos

Cero acción de tu parte. Solo ten en mente que cuando registres un
pago en admin, el sistema te pedirá:
1. Elegir el paquete del cliente
2. Si das descuento, marcar el motivo

Reportes nuevos que vas a poder ver:
- Revenue por paquete
- Total de descuentos por tipo
- ARPU real vs precio listado

Cualquier duda, mándame WhatsApp.

— Roy
```

### Mensaje post-cutover (mañana siguiente)

```
Buenos días, [Nombre].

Ya está aplicada la mejora estructural en VELUM. Todo funcionando.

Cambios que vas a notar:
- Al registrar un pago, hay que elegir el paquete
- Si das descuento, hay que marcar el motivo

Nuevos reportes disponibles en tu panel:
- Sección "Analytics" → "Por paquete"
- Sección "Analytics" → "Descuentos"

Cualquier feedback me lo pasas. Las primeras 72h estamos en monitoreo
extra por si algo se ve raro.

— Roy
```

---

## 7. Métricas de éxito post-cutover (primeros 30 días)

| Métrica | Target | Cómo medir |
|---|---|---|
| **% de pagos con package_id** | 100% | `COUNT WHERE package_id IS NOT NULL AND is_legacy = false / total nuevos` |
| **% de descuentos con motivo** | 100% | `COUNT WHERE discount_type IS NOT NULL AND applied < list / total con descuento` |
| **Errores reportados por gyms** | <5 en primer mes | Tickets de soporte |
| **Adopción de reportes nuevos** | >50% de gyms los abren | Analytics de eventos |
| **Tiempo registro promedio** | <90 segundos | Medir flow admin |

Si las métricas no se cumplen en 30 días, revisar UX del flow de registro.

---

## 8. Riesgos identificados

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Edge functions intentan insertar pago sin package_id | MEDIA | Auditar y refactorizar todas las funciones que escriben a `pagos` antes del cutover |
| Gyms se confunden con el dropdown obligatorio | MEDIA | Mensaje pre-cutover + tutorial in-app |
| Constraints rompen renovaciones automáticas | BAJA | Verificar que auto-renewal use el `source='auto_renewal'` y respete los constraints |
| Performance degrada por triggers | BAJA | Triggers son ligeros, pero monitorear `pg_stat_statements` |
| Snapshot ocupa espacio | BAJA | Eliminar `pagos_pre_v2_snapshot` después de 30 días si todo va bien |

---

## 9. Cleanup (30 días después)

Si todo va bien durante 30 días:

```sql
-- Eliminar snapshot (ahorra espacio)
DROP TABLE pagos_pre_v2_snapshot;

-- Optimizar tabla pagos
VACUUM FULL ANALYZE pagos;

-- Documentar finalización
UPDATE migrations_log
SET notes = notes || ' · Cleanup 30d completado'
WHERE name = 'schema_v2_pagos_storefront';
```

---

## 10. Documentos relacionados

- `VELUM_STOREFRONT_SCHEMA_V2.sql` — DDL completo del schema v2
- `VELUM_ADMIN_REGISTRAR_PAGO_MOCKUP.html` — Mockup visual del nuevo flow admin
- `VELUM_STOREFRONT_ARCHITECTURE.md` — Arquitectura general del Storefront
- `VELUM_STOREFRONT_MOCKUP.html` — Storefront público
- `VELUM_MAGIC_ONBOARDING_FLOW.html` — Post-compra onboarding

---

**Última actualización:** 22 May 2026 · **Owner:** Roy Cervus
