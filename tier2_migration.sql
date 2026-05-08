-- ============================================================
-- VELUM — Tier 2 Migration
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- 2.1 Congelar / pausar membresía
-- Agrega 3 columnas a la tabla pagos
ALTER TABLE pagos
  ADD COLUMN IF NOT EXISTS congelado        BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS congelado_desde  DATE,
  ADD COLUMN IF NOT EXISTS dias_congelados  INTEGER DEFAULT 0;

-- 2.4 Rastreo de referidos
-- Agrega columna referido_por a la tabla clientes
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS referido_por TEXT;

-- Verificación (opcional — corre después para confirmar)
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'pagos' AND column_name IN ('congelado','congelado_desde','dias_congelados');
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'clientes' AND column_name = 'referido_por';
