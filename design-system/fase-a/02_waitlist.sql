-- ════════════════════════════════════════════════════════════════════
-- VELUM · Fase A.5 — Tabla waitlist (lista de espera de clases · Studios)
-- ────────────────────────────────────────────────────────────────────
-- Cierra la deuda: el código (panel + checkin.html) ya referencia
-- 'waitlist' pero la tabla no existía. Espeja la estructura y RLS de
-- 'reservas' (misma seguridad) + columna 'posicion'.
-- ADITIVO: tabla nueva, no toca nada existente. Rollback al final.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.waitlist (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id         bigint NOT NULL,
  horario_id     uuid,
  cliente_id     bigint,
  cliente_nombre text NOT NULL,
  portal_token   text,
  fecha          date NOT NULL,
  clase_tipo     text,
  clase_hora     text,
  clase_dia      text,
  posicion       integer NOT NULL DEFAULT 1,
  estado         text DEFAULT 'espera',   -- espera | promovido | cancelado
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- PostgREST necesita GRANT para exponer la tabla; las políticas restringen filas.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.waitlist TO authenticated;

-- ── Políticas RLS — espejo EXACTO de 'reservas' ──
CREATE POLICY waitlist_select ON public.waitlist FOR SELECT TO authenticated
USING (
  is_superadmin()
  OR ((gym_id = auth_gym_id()) AND (auth_app_rol() = ANY (ARRAY['admin','staff','superadmin'])))
  OR (cliente_id = auth_cliente_id())
  OR (portal_token = (auth.jwt() ->> 'portal_token'))
);

CREATE POLICY waitlist_insert ON public.waitlist FOR INSERT TO authenticated
WITH CHECK (
  is_superadmin()
  OR ((gym_id = auth_gym_id()) AND (auth_app_rol() = ANY (ARRAY['admin','staff','superadmin'])))
  OR ((cliente_id = auth_cliente_id()) AND (gym_id = auth_gym_id()))
  OR ((portal_token = (auth.jwt() ->> 'portal_token')) AND (gym_id = auth_gym_id()))
);

CREATE POLICY waitlist_update ON public.waitlist FOR UPDATE TO authenticated
USING (
  is_superadmin()
  OR ((gym_id = auth_gym_id()) AND (auth_app_rol() = ANY (ARRAY['admin','staff','superadmin'])))
  OR (cliente_id = auth_cliente_id())
  OR (portal_token = (auth.jwt() ->> 'portal_token'))
);

CREATE POLICY waitlist_delete ON public.waitlist FOR DELETE TO authenticated
USING (
  is_superadmin()
  OR ((gym_id = auth_gym_id()) AND (auth_app_rol() = ANY (ARRAY['admin','staff','superadmin'])))
  OR (cliente_id = auth_cliente_id())
  OR (portal_token = (auth.jwt() ->> 'portal_token'))
);

-- Índice para lookups por clase/fecha/estado/orden
CREATE INDEX IF NOT EXISTS idx_waitlist_lookup
  ON public.waitlist (gym_id, horario_id, fecha, estado, posicion);

-- ── ROLLBACK ──
-- DROP TABLE IF EXISTS public.waitlist CASCADE;
