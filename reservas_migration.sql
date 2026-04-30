-- ════════════════════════════════════════════════════════
--  VELUM — Sistema de Reservas de Clases
--  Ejecutar en: Supabase Dashboard → SQL Editor
-- ════════════════════════════════════════════════════════

-- ── 1. Tabla principal de reservas ────────────────────
CREATE TABLE IF NOT EXISTS reservas (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  gym_id          UUID NOT NULL,
  horario_id      UUID,                      -- referencia a horarios.id (plantilla semanal)
  cliente_id      UUID,                      -- referencia a pagos/clientes (si está disponible)
  cliente_nombre  TEXT NOT NULL,             -- nombre del atleta (denormalizado para velocidad)
  portal_token    TEXT,                      -- token del portal atleta (para identificar sesión)
  fecha           DATE NOT NULL,             -- fecha específica de la clase (ej: 2025-05-02)
  clase_tipo      TEXT,                      -- tipo de clase (ej: 'Strength', 'Hyrox')
  clase_hora      TEXT,                      -- hora de la clase (ej: '7:00', '18:30')
  clase_dia       TEXT,                      -- día de la semana en español (ej: 'Lunes')
  estado          TEXT DEFAULT 'reservado',  -- 'reservado' | 'checkin' | 'cancelado' | 'no_show'
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. Índices de rendimiento ─────────────────────────
-- Consulta principal: todas las reservas de un gym para una fecha
CREATE INDEX IF NOT EXISTS idx_reservas_gym_fecha
  ON reservas(gym_id, fecha)
  WHERE estado != 'cancelado';

-- Conteo de cupos por clase específica
CREATE INDEX IF NOT EXISTS idx_reservas_horario_fecha
  ON reservas(horario_id, fecha)
  WHERE estado != 'cancelado';

-- Reservas del cliente actual (para evitar duplicados)
CREATE INDEX IF NOT EXISTS idx_reservas_token_fecha
  ON reservas(portal_token, fecha)
  WHERE estado != 'cancelado';

-- ── 3. Unique constraint: un cliente no puede reservar
--       la misma clase dos veces en la misma fecha ──────
CREATE UNIQUE INDEX IF NOT EXISTS idx_reservas_no_duplicado
  ON reservas(gym_id, horario_id, fecha, portal_token)
  WHERE estado != 'cancelado';

-- ── 4. Trigger: cuando se registra un check-in QR,
--       actualizar la reserva correspondiente a 'checkin'
-- (Permite que el Edge Function de check-in no necesite modificación)

CREATE OR REPLACE FUNCTION fn_reserva_on_checkin()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Buscar reserva activa que coincida con nombre + fecha + gym
  UPDATE reservas
  SET estado = 'checkin'
  WHERE gym_id = NEW.gym_id
    AND fecha = NEW.fecha::date
    AND LOWER(TRIM(cliente_nombre)) = LOWER(TRIM(NEW.nombre))
    AND estado = 'reservado';
  RETURN NEW;
END;
$$;

-- Crear trigger (elimina si ya existe para evitar duplicados)
DROP TRIGGER IF EXISTS trg_checkin_update_reserva ON qr_checkins;
CREATE TRIGGER trg_checkin_update_reserva
  AFTER INSERT ON qr_checkins
  FOR EACH ROW
  EXECUTE FUNCTION fn_reserva_on_checkin();

-- ── 5. Trigger: marcar no_show a fin de día
--       (opcional — ejecutar como cron job diario a las 23:59)
-- Puedes configurarlo en Supabase > Database > Hooks + pg_cron
-- O ejecutarlo manualmente cuando sea necesario:
--
-- UPDATE reservas
-- SET estado = 'no_show'
-- WHERE fecha < CURRENT_DATE
--   AND estado = 'reservado';

-- ── 6. RLS Policies ──────────────────────────────────
-- Habilitar RLS en la tabla
ALTER TABLE reservas ENABLE ROW LEVEL SECURITY;

-- Política: leer reservas del mismo gym (lectura pública con anon key)
CREATE POLICY "Read reservas by gym_id"
  ON reservas
  FOR SELECT
  USING (true);  -- Filtrado por gym_id en el query, no en RLS

-- Política: insertar reservas (cualquier cliente autenticado o anon puede reservar)
CREATE POLICY "Insert own reserva"
  ON reservas
  FOR INSERT
  WITH CHECK (true);  -- Validación de negocio en el cliente

-- Política: cancelar solo las propias reservas (por portal_token)
CREATE POLICY "Cancel own reserva"
  ON reservas
  FOR UPDATE
  USING (true);  -- portal_token validado en el query

-- ── 7. Columna gym_id en horarios (si no existe) ─────
-- Verificar que existe antes de ejecutar:
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'horarios' AND column_name = 'gym_id';
-- Si no existe, agregar:
-- ALTER TABLE horarios ADD COLUMN IF NOT EXISTS gym_id UUID;

-- ════════════════════════════════════════════════════════
--  INSTRUCCIONES DE DESPLIEGUE
-- ════════════════════════════════════════════════════════
-- 1. Ir a Supabase Dashboard → SQL Editor → New Query
-- 2. Pegar este archivo completo y ejecutar
-- 3. Verificar que la tabla 'reservas' aparece en Table Editor
-- 4. Verificar que el trigger 'trg_checkin_update_reserva' existe en
--    Database → Triggers
-- 5. Subir los archivos atleta.html y VELUM_Sistema_Interno.html actualizados
-- ════════════════════════════════════════════════════════
