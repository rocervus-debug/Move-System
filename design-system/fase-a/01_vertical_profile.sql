-- ════════════════════════════════════════════════════════════════════
-- VELUM · Fase A — Contrato de datos para segmentación por vertical
-- ────────────────────────────────────────────────────────────────────
-- ADITIVO y NO-DESTRUCTIVO. No toca ninguna columna existente.
-- Todos los gyms actuales quedan como 'velum' (= el sistema de hoy),
-- así que NADA cambia de comportamiento hasta que un gym se marque
-- explícitamente como 'studios' o 'recovery'.
--
-- ⚠️ NO APLICADO A PRODUCCIÓN. Revisar y aplicar con OK explícito
--    (vía apply_migration), igual que el fix del kiosko.
-- ════════════════════════════════════════════════════════════════════

-- 1) Vertical principal del gym (typed, queryable, RLS-friendly).
--    DEFAULT 'velum' → los 6 gyms actuales NO cambian de comportamiento.
ALTER TABLE public.gyms
  ADD COLUMN IF NOT EXISTS vertical text NOT NULL DEFAULT 'velum';

-- Restringe a las verticales soportadas en Fase A (ampliable después).
ALTER TABLE public.gyms
  DROP CONSTRAINT IF EXISTS gyms_vertical_chk;
ALTER TABLE public.gyms
  ADD CONSTRAINT gyms_vertical_chk
  CHECK (vertical IN ('velum','studios','recovery'));

-- 2) Perfil de configuración por gym: módulos on/off + vocabulario.
--    Se guarda en gym_config (key/value ya existente) → CERO cambios de
--    esquema. value es JSON. Si no existe el row, el panel usa el default
--    del vertical. Esto es OPCIONAL: el vertical solo ya define el preset.
--
--    Ejemplo de value para un Studios:
--    {
--      "modules": { "reservas": true, "creditos": true, "waitlist": true,
--                   "spots": true, "accesos": false },
--      "vocab":   { "clase":"clase", "coach":"instructor",
--                   "miembro":"cliente" },
--      "booking_model": "spot", "membership_model": "credits"
--    }
--    (No se inserta nada aquí; el panel lo escribe al configurar el gym.)

-- 3) Helper de lectura: vertical efectiva de un gym (con fallback seguro).
CREATE OR REPLACE FUNCTION public.gym_vertical(p_gym_id bigint)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
  SELECT COALESCE((SELECT vertical FROM public.gyms WHERE id = p_gym_id), 'velum');
$$;

-- Nota: esta función SÓLO lee (SELECT). A diferencia de kiosco_lookup,
-- NO escribe ni llama a funciones de escritura → STABLE es correcto aquí.

-- 4) (Opcional, recomendado) Índice para filtrar gyms por vertical en
--    el Super Admin / métricas SaaS.
CREATE INDEX IF NOT EXISTS idx_gyms_vertical ON public.gyms (vertical);

-- ── ROLLBACK (si hiciera falta revertir) ──
-- DROP INDEX IF EXISTS public.idx_gyms_vertical;
-- DROP FUNCTION IF EXISTS public.gym_vertical(bigint);
-- ALTER TABLE public.gyms DROP CONSTRAINT IF EXISTS gyms_vertical_chk;
-- ALTER TABLE public.gyms DROP COLUMN IF EXISTS vertical;
