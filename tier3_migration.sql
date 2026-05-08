-- ============================================================
-- VELUM — Tier 3 Migration
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- 3.1 Medidas de progreso corporal
-- Nueva tabla para rastrear evolución del atleta
CREATE TABLE IF NOT EXISTS medidas (
  id              BIGSERIAL PRIMARY KEY,
  gym_id          TEXT NOT NULL,
  cliente_id      BIGINT REFERENCES clientes(id) ON DELETE CASCADE,
  fecha           DATE NOT NULL DEFAULT CURRENT_DATE,
  peso_kg         NUMERIC(5,1),
  grasa_pct       NUMERIC(4,1),
  cintura_cm      NUMERIC(5,1),
  cadera_cm       NUMERIC(5,1),
  pecho_cm        NUMERIC(5,1),
  brazo_cm        NUMERIC(5,1),
  notas           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para consultas por cliente ordenadas por fecha
CREATE INDEX IF NOT EXISTS medidas_cliente_fecha_idx
  ON medidas(cliente_id, fecha DESC);

-- Índice para consultas por gym
CREATE INDEX IF NOT EXISTS medidas_gym_idx
  ON medidas(gym_id);

-- Habilitar RLS (Row Level Security) — opcional pero recomendado
-- ALTER TABLE medidas ENABLE ROW LEVEL SECURITY;

-- Verificación (opcional — corre después para confirmar)
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'medidas';
-- SELECT COUNT(*) FROM medidas;
