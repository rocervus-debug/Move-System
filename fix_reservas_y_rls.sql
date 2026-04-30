-- ════════════════════════════════════════════════════════════════
--  VELUM — Fix: Reservas + RLS Policies
--  Ejecutar en: Supabase Dashboard → SQL Editor → New Query
-- ════════════════════════════════════════════════════════════════

-- ── FIX 1: Recrear tabla reservas con gym_id BIGINT (no UUID) ──
-- El sistema usa gym_id como entero (1, 2...), no UUID.
-- La migración anterior declaró UUID incorrectamente.

DROP TABLE IF EXISTS reservas CASCADE;

CREATE TABLE reservas (
  id              UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  gym_id          BIGINT  NOT NULL,          -- entero, igual que gyms.id
  horario_id      UUID,                       -- UUID de horarios.id
  cliente_id      UUID,                       -- UUID de clientes.id
  cliente_nombre  TEXT    NOT NULL,
  portal_token    TEXT,
  fecha           DATE    NOT NULL,
  clase_tipo      TEXT,
  clase_hora      TEXT,
  clase_dia       TEXT,
  estado          TEXT    DEFAULT 'reservado',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_reservas_gym_fecha
  ON reservas(gym_id, fecha)
  WHERE estado != 'cancelado';

CREATE INDEX idx_reservas_horario_fecha
  ON reservas(horario_id, fecha)
  WHERE estado != 'cancelado';

CREATE INDEX idx_reservas_token_fecha
  ON reservas(portal_token, fecha)
  WHERE estado != 'cancelado';

CREATE UNIQUE INDEX idx_reservas_no_duplicado
  ON reservas(gym_id, horario_id, fecha, portal_token)
  WHERE estado != 'cancelado';

-- RLS
ALTER TABLE reservas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_reservas"   ON reservas FOR SELECT USING (true);
CREATE POLICY "insert_reservas" ON reservas FOR INSERT WITH CHECK (true);
CREATE POLICY "update_reservas" ON reservas FOR UPDATE USING (true);


-- ── FIX 2: RLS en horarios — lectura pública (ANON key) ─────────
-- Sin esta policy, el portal del atleta no puede leer las clases.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'horarios' AND policyname = 'Public read horarios'
  ) THEN
    EXECUTE 'CREATE POLICY "Public read horarios" ON horarios FOR SELECT USING (true)';
  END IF;
END$$;


-- ── FIX 3: RLS en clientes — lectura por numero (ANON key) ──────
-- Sin esta policy, el kiosko no puede buscar por número de cliente.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'clientes' AND policyname = 'Kiosco lookup by numero'
  ) THEN
    EXECUTE 'CREATE POLICY "Kiosco lookup by numero" ON clientes FOR SELECT USING (true)';
  END IF;
END$$;


-- ── Verificación rápida ──────────────────────────────────────────
-- Ejecuta esto después para confirmar que todo está bien:
--
-- SELECT tablename, policyname, cmd FROM pg_policies
-- WHERE tablename IN ('reservas','horarios','clientes')
-- ORDER BY tablename;
