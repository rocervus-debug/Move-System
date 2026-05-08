-- ============================================================
-- VELUM — Tier 4.2 Migration: Lista de Espera (Waitlist)
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- Nueva tabla waitlist para clases llenas
CREATE TABLE IF NOT EXISTS waitlist (
  id             BIGSERIAL PRIMARY KEY,
  gym_id         BIGINT NOT NULL,
  horario_id     UUID,
  fecha          DATE NOT NULL,
  portal_token   TEXT NOT NULL,
  cliente_nombre TEXT NOT NULL,
  posicion       INTEGER,
  estado         TEXT DEFAULT 'espera',   -- espera | notificado | cancelado
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Índice principal: waitlist por clase y fecha
CREATE INDEX IF NOT EXISTS waitlist_horario_fecha_idx
  ON waitlist(horario_id, fecha, estado);

-- Índice para consultar la posición del atleta en su lista
CREATE INDEX IF NOT EXISTS waitlist_token_fecha_idx
  ON waitlist(portal_token, fecha);

-- Unicidad: un atleta solo puede estar una vez en espera por clase/fecha
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_no_duplicado_idx
  ON waitlist(horario_id, fecha, portal_token)
  WHERE estado = 'espera';

-- Habilitar RLS
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_waitlist"   ON waitlist FOR SELECT USING (true);
CREATE POLICY "insert_waitlist" ON waitlist FOR INSERT WITH CHECK (true);
CREATE POLICY "update_waitlist" ON waitlist FOR UPDATE USING (true);
CREATE POLICY "delete_waitlist" ON waitlist FOR DELETE USING (true);

-- Verificación (corre después para confirmar)
-- SELECT COUNT(*) FROM waitlist;
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name='waitlist';
