-- Extend config_programas for multi-discipline support
-- Run in Supabase SQL Editor

-- Add activa flag (whether this gym offers this discipline)
ALTER TABLE config_programas
  ADD COLUMN IF NOT EXISTS activa BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS dias_semana JSONB DEFAULT '[0,2,4]'::jsonb;

-- Default existing rows (Strength, Hyrox, Endurance) to active with their historical defaults
UPDATE config_programas SET activa = TRUE, dias_semana = '[0,2,4]'::jsonb
  WHERE activa IS NULL;

-- Index to quickly fetch active disciplines per gym
CREATE INDEX IF NOT EXISTS idx_config_programas_gym_activa
  ON config_programas(gym_id, activa)
  WHERE activa = TRUE;

COMMENT ON COLUMN config_programas.activa       IS 'Whether the gym offers this discipline';
COMMENT ON COLUMN config_programas.dias_semana  IS 'Active training days: JSON array [0..6] where 0=Mon, 6=Sun';
