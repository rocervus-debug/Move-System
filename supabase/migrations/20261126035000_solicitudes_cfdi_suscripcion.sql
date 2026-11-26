create table public.solicitudes_cfdi_suscripcion (
  id uuid primary key default gen_random_uuid(),
  gym_id bigint not null default public.auth_gym_id() references public.gyms(id),
  periodo date not null check (extract(day from periodo) = 1),
  creada_en timestamptz not null default now(),
  atendida boolean not null default false,
  unique (gym_id, periodo)
);
create index solicitudes_cfdi_pendientes on public.solicitudes_cfdi_suscripcion (creada_en) where not atendida;
alter table public.solicitudes_cfdi_suscripcion enable row level security;
revoke all on public.solicitudes_cfdi_suscripcion from public, anon, authenticated;
grant select, insert (periodo), update (atendida) on public.solicitudes_cfdi_suscripcion to authenticated;

create policy ver_solicitudes on public.solicitudes_cfdi_suscripcion for select to authenticated
using ((select public.is_superadmin()) or
       ((select public.auth_app_rol()) = 'admin' and gym_id = (select public.auth_gym_id())));

create policy solicitar_cfdi on public.solicitudes_cfdi_suscripcion for insert to authenticated
with check ((select public.auth_app_rol()) in ('admin','superadmin') and
            gym_id = (select public.auth_gym_id()) and periodo <= (now() at time zone 'America/Mexico_City')::date);

create policy atender_solicitud on public.solicitudes_cfdi_suscripcion for update to authenticated
using ((select public.is_superadmin()) and not atendida)
with check ((select public.is_superadmin()) and atendida);
