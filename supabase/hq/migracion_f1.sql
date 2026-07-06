-- VELUM HQ · F1 — tablas del CRM de superadmin + RLS + puente desde leads_landing
-- Aplicar con OK de Roy. Aditiva: no toca ninguna tabla existente.

-- 1) Leads del negocio (VELUM vendiendo a gyms), NO confundir con leads de los gyms
create table if not exists saas_leads (
  id bigint generated always as identity primary key,
  empresa text not null,
  vertical text not null default 'gym' check (vertical in ('gym','studios','recovery')),
  ciudad text,
  canal text not null default 'manual',            -- prospeccion-bajio | landing | referido | meta-ads | manual
  contacto jsonb not null default '{}'::jsonb,     -- {tel, mail, web_ig, decision_maker}
  sistema_actual text,
  angulo text,
  tier text not null default 'C' check (tier in ('A','B','C')),
  etapa text not null default 'lead' check (etapa in
    ('lead','contactado','calificado','demo','trial','pagando','perdido','nurture')),
  motivo_perdido text,
  proxima_accion text,
  proxima_accion_fecha date,
  gym_id bigint references gyms(id),               -- se llena al convertir
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists saas_leads_etapa_idx on saas_leads (etapa, proxima_accion_fecha);

-- 2) Bitácora por lead (el registro obligatorio del Flujo 4)
create table if not exists saas_lead_events (
  id bigint generated always as identity primary key,
  lead_id bigint not null references saas_leads(id) on delete cascade,
  tipo text not null check (tipo in ('mensaje','llamada','demo','nota','etapa')),
  detalle text not null,
  created_at timestamptz not null default now()
);
create index if not exists saas_lead_events_lead_idx on saas_lead_events (lead_id, created_at desc);

-- 3) Tareas del founder (F3 las auto-genera; la tabla nace ya para no migrar dos veces)
create table if not exists saas_tasks (
  id bigint generated always as identity primary key,
  titulo text not null,
  tipo text not null default 'manual' check (tipo in ('auto','manual')),
  regla_origen text,
  lead_id bigint references saas_leads(id) on delete cascade,
  gym_id bigint references gyms(id),
  due_date date,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

-- 4) Notas por cuenta (gym)
create table if not exists gym_notes (
  id bigint generated always as identity primary key,
  gym_id bigint not null references gyms(id) on delete cascade,
  nota text not null,
  created_at timestamptz not null default now()
);

-- 5) RLS: SOLO superadmin, en todo, para todo
alter table saas_leads enable row level security;
alter table saas_lead_events enable row level security;
alter table saas_tasks enable row level security;
alter table gym_notes enable row level security;

create policy saas_leads_super on saas_leads for all
  using (is_superadmin()) with check (is_superadmin());
create policy saas_lead_events_super on saas_lead_events for all
  using (is_superadmin()) with check (is_superadmin());
create policy saas_tasks_super on saas_tasks for all
  using (is_superadmin()) with check (is_superadmin());
create policy gym_notes_super on gym_notes for all
  using (is_superadmin()) with check (is_superadmin());

-- 6) Puente: todo lead del lead-capture de la landing cae al pipeline con canal='landing'
create or replace function copy_landing_lead_to_saas()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into saas_leads (empresa, canal, contacto, etapa, angulo)
  values (
    coalesce(nullif(btrim(new.email),''), 'lead landing'),
    'landing',
    jsonb_build_object('mail', new.email),
    'lead',
    'Dejó su correo en la landing pidiendo información'
  );
  return new;
end;
$$;

drop trigger if exists trg_landing_lead_to_saas on leads_landing;
create trigger trg_landing_lead_to_saas
  after insert on leads_landing
  for each row execute function copy_landing_lead_to_saas();

-- 7) updated_at automático
create or replace function touch_saas_leads_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists trg_saas_leads_touch on saas_leads;
create trigger trg_saas_leads_touch before update on saas_leads
  for each row execute function touch_saas_leads_updated_at();
