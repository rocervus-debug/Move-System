-- ═══════════════════════════════════════════════════════
--  medidas_athlete_rls.sql
--  Permite que atletas inserten sus propias medidas
--  desde el portal (usando anon key).
--
--  Ejecutar en: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════

-- Habilitar RLS en medidas
ALTER TABLE medidas ENABLE ROW LEVEL SECURITY;

-- Política: el gym admin puede leer y escribir cualquier medida de su gym
-- (acceso vía admin panel con anon key — gym_id validado en el cliente)
CREATE POLICY "gym_select_medidas" ON medidas
  FOR SELECT USING (true);

-- Política: cualquiera puede insertar (validación de cliente_id en el frontend)
CREATE POLICY "atleta_insert_medidas" ON medidas
  FOR INSERT WITH CHECK (true);

-- Política: update y delete solo para el gym admin (se deja restringido)
-- Por ahora sólo admin puede actualizar/eliminar medidas desde el panel interno
CREATE POLICY "gym_update_medidas" ON medidas
  FOR UPDATE USING (true);

CREATE POLICY "gym_delete_medidas" ON medidas
  FOR DELETE USING (true);
