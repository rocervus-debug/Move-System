-- Migration: coach_tarifas
-- Mueve las tarifas de coaches de localStorage a Supabase
-- Cada registro guarda la tarifa-por-clase de un coach para un mes específico

create table if not exists public.coach_tarifas (
  id          bigserial primary key,
  gym_id      text        not null,
  coach_id    bigint      not null,
  anio        integer     not null,
  mes         integer     not null,  -- 0=enero ... 11=diciembre (igual que JS getMonth())
  tarifa      numeric(10,2) not null default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique(gym_id, coach_id, anio, mes)
);

-- RLS
alter table public.coach_tarifas enable row level security;

-- Lectura: solo el gym correspondiente (vía gimnasios.propietario_id = auth.uid())
create policy "coach_tarifas_select" on public.coach_tarifas
  for select using (
    gym_id in (
      select id::text from public.gimnasios
      where propietario_id = auth.uid()
    )
  );

-- Insertar / actualizar: solo el gym correspondiente
create policy "coach_tarifas_upsert" on public.coach_tarifas
  for insert with check (
    gym_id in (
      select id::text from public.gimnasios
      where propietario_id = auth.uid()
    )
  );

create policy "coach_tarifas_update" on public.coach_tarifas
  for update using (
    gym_id in (
      select id::text from public.gimnasios
      where propietario_id = auth.uid()
    )
  );

-- Índice para queries frecuentes
create index if not exists coach_tarifas_gym_mes on public.coach_tarifas(gym_id, anio, mes);
