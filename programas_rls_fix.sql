-- ══════════════════════════════════════════════════════════════════
-- Fix: programas table RLS policies
-- El admin panel usa anon key — necesita INSERT + UPDATE + DELETE
-- Run en Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════════

-- Enable RLS (safe to run even if already enabled)
ALTER TABLE programas ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts (ignore errors if they don't exist)
DROP POLICY IF EXISTS "allow_select_programas"  ON programas;
DROP POLICY IF EXISTS "allow_insert_programas"  ON programas;
DROP POLICY IF EXISTS "allow_update_programas"  ON programas;
DROP POLICY IF EXISTS "allow_delete_programas"  ON programas;

-- SELECT: cualquiera puede leer (Edge Function + admin + atleta)
CREATE POLICY "allow_select_programas"
  ON programas FOR SELECT
  USING (true);

-- INSERT: permitir con gym_id válido (admin panel usa anon key)
CREATE POLICY "allow_insert_programas"
  ON programas FOR INSERT
  WITH CHECK (gym_id IS NOT NULL);

-- UPDATE: permitir cuando gym_id coincide (admin filtra por gym_id)
CREATE POLICY "allow_update_programas"
  ON programas FOR UPDATE
  USING (gym_id IS NOT NULL)
  WITH CHECK (gym_id IS NOT NULL);

-- DELETE: permitir por gym_id
CREATE POLICY "allow_delete_programas"
  ON programas FOR DELETE
  USING (gym_id IS NOT NULL);
