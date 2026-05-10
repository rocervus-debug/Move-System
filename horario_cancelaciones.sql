-- ═══════════════════════════════════════════════════════
--  horario_cancelaciones — Cancelaciones individuales de clase
--  Permite cancelar una ocurrencia específica sin afectar el horario base
-- ═══════════════════════════════════════════════════════

create table if not exists public.horario_cancelaciones (
  id           uuid primary key default gen_random_uuid(),
  horario_id   uuid not null references public.horarios(id) on delete cascade,
  fecha        date not null,
  gym_id       uuid not null references public.gyms(id) on delete cascade,
  motivo       text,
  created_at   timestamptz not null default now(),
  created_by   uuid references public.usuarios(id) on delete set null,

  -- Solo una cancelación por clase por fecha
  unique (horario_id, fecha)
);

-- Índices para lookups rápidos
create index if not exists idx_hcancel_gym_fecha
  on public.horario_cancelaciones (gym_id, fecha);

create index if not exists idx_hcancel_horario
  on public.horario_cancelaciones (horario_id);

-- RLS
alter table public.horario_cancelaciones enable row level security;

-- Admins del gym pueden leer y escribir sus propias cancelaciones
create policy "gym_admin_all" on public.horario_cancelaciones
  for all
  using (
    gym_id in (
      select gym_id from public.usuarios where id = auth.uid()
    )
  );

-- Atletas pueden leer cancelaciones de su gym
create policy "atleta_read" on public.horario_cancelaciones
  for select
  using (
    gym_id in (
      select gym_id from public.clientes where id = auth.uid()
    )
  );
