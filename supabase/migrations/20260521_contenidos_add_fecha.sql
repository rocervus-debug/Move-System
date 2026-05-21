-- Migration: agregar columna fecha a contenidos
-- Permite programar contenido en fechas exactas de cualquier mes/año
-- Los registros viejos (solo con dia) siguen funcionando por retrocompatibilidad

ALTER TABLE contenidos
  ADD COLUMN IF NOT EXISTS fecha DATE;

-- Índice para queries por mes
CREATE INDEX IF NOT EXISTS idx_contenidos_fecha ON contenidos(fecha);
CREATE INDEX IF NOT EXISTS idx_contenidos_gym_fecha ON contenidos(gym_id, fecha);
