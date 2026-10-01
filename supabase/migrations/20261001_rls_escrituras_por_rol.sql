-- APLICADA 2026-10-01 (migración rls_escrituras_por_rol, OK de Roy) — Escrituras por rol, no solo por gym
-- Auditoría: AUDITORIA_RLS_ESCRITURAS_2026-10-01.md
--
-- Mismo patrón que el P0 de gyms_update: policies que solo piden
-- gym_id = auth_gym_id(). El JWT de atleta (velum-atleta-auth) trae gym_id, así que
-- cualquier socio — o cualquiera con la contraseña compartida del portal — escribía
-- configuración, precios, horarios, coaches y la bitácora de auditoría de su gym.
--
-- Diseño en 4 niveles:
--   A) Config y dinero (gym_config, packages)  → solo admin/staff/superadmin
--   B) Operación del gym (horarios, coaches…)   → cualquier rol del PANEL (incluye coach y recepción)
--   C) audit_log                                → append-only para el panel; borrar/editar solo superadmin
--   D) Filas del propio atleta (clientes, reservas, waitlist…) → triggers que fijan
--      qué columnas puede tocar y le impiden mover filas a otro gym
--   + clases_baja_ocupacion: dejaba leer reservas/pagos de CUALQUIER gym por parámetro.
--


-- ─────────────────────────────────────────────────────────────────────
-- Helpers de rol. Una sola lista por nivel (regla: una sola fuente).
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.auth_es_admin()
returns boolean language sql stable set search_path to 'public','pg_temp' as $$
  select coalesce(auth.jwt() ->> 'app_rol', '') in ('admin','staff','superadmin');
$$;

-- Todos los roles que el panel puede emitir (move-login firma app_rol = usuarios.rol).
-- marketing/operaciones existen en el selector de "Nuevo usuario" aunque hoy no hay filas.
create or replace function public.auth_es_staff()
returns boolean language sql stable set search_path to 'public','pg_temp' as $$
  select coalesce(auth.jwt() ->> 'app_rol', '') in
    ('admin','staff','superadmin','recepcion','coach','marketing','operaciones');
$$;

-- ─────────────────────────────────────────────────────────────────────
-- A) gym_config — solo admin. SELECT no se toca (branding_open + admin_select).
-- ─────────────────────────────────────────────────────────────────────
drop policy if exists gym_config_authenticated_insert on public.gym_config;
drop policy if exists gym_config_authenticated_update on public.gym_config;
drop policy if exists gym_config_authenticated_delete on public.gym_config;

create policy gym_config_admin_insert on public.gym_config for insert to authenticated
  with check ((select is_superadmin()) or (gym_id = (select auth_gym_id()) and (select auth_es_admin())));
create policy gym_config_admin_update on public.gym_config for update to authenticated
  using      ((select is_superadmin()) or (gym_id = (select auth_gym_id()) and (select auth_es_admin())))
  with check ((select is_superadmin()) or (gym_id = (select auth_gym_id()) and (select auth_es_admin())));
create policy gym_config_admin_delete on public.gym_config for delete to authenticated
  using      ((select is_superadmin()) or (gym_id = (select auth_gym_id()) and (select auth_es_admin())));

-- ─────────────────────────────────────────────────────────────────────
-- A) packages — solo admin (igual que storefront_listings / gym_storefront).
-- Excepción angosta: recepción puede crear el paquete de cortesía que arma
-- _paqueteCortesia() al marcar "Llegó" a un prospecto ($0, inactivo, interno).
-- ─────────────────────────────────────────────────────────────────────
drop policy if exists packages_authenticated_insert on public.packages;
drop policy if exists packages_authenticated_update on public.packages;
drop policy if exists packages_authenticated_delete on public.packages;

create policy packages_admin_insert on public.packages for insert to authenticated
  with check ((select is_superadmin()) or (gym_id = (select auth_gym_id()) and (select auth_es_admin())));
create policy packages_recepcion_cortesia on public.packages for insert to authenticated
  with check (gym_id = (select auth_gym_id()) and (select auth_app_rol()) = 'recepcion'
              and price_mxn = 0 and is_active = false and internal_only = true);
create policy packages_admin_update on public.packages for update to authenticated
  using      ((select is_superadmin()) or (gym_id = (select auth_gym_id()) and (select auth_es_admin())))
  with check ((select is_superadmin()) or (gym_id = (select auth_gym_id()) and (select auth_es_admin())));
create policy packages_admin_delete on public.packages for delete to authenticated
  using      ((select is_superadmin()) or (gym_id = (select auth_gym_id()) and (select auth_es_admin())));

-- ─────────────────────────────────────────────────────────────────────
-- B) Operación del gym — cualquier rol del panel. El atleta pierde lectura y
-- escritura en estas tablas EXCEPTO horarios (la app lee el calendario directo).
-- atleta.html no lee ninguna de las otras (grep rest/v1); las edge functions
-- usan service role y no pasan por RLS.
-- ─────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['horarios','coaches','asistencias','visitas','evaluaciones','cliente_notas',
                           'programas','config_programas','contenidos','campanas','solicitudes','qr_checkins'] loop
    execute format('drop policy if exists gym_isolation on public.%I', t);
    execute format($p$create policy %I on public.%I for all to authenticated
      using      ((select is_superadmin()) or (gym_id = (select auth_gym_id()) and (select auth_es_staff())))
      with check ((select is_superadmin()) or (gym_id = (select auth_gym_id()) and (select auth_es_staff())))$p$,
      t || '_staff_all', t);
  end loop;
end $$;

-- El atleta sigue leyendo el calendario de SU gym (atleta.html: rest/v1/horarios?gym_id=eq.…)
create policy horarios_atleta_select on public.horarios for select to authenticated
  using (gym_id = (select auth_gym_id()));

-- horario_cancelaciones: SELECT público se queda (hc_public_select); escrituras solo panel.
drop policy if exists hc_authenticated_insert on public.horario_cancelaciones;
drop policy if exists hc_authenticated_update on public.horario_cancelaciones;
drop policy if exists hc_authenticated_delete on public.horario_cancelaciones;
create policy hc_staff_insert on public.horario_cancelaciones for insert to authenticated
  with check ((select is_superadmin()) or (gym_id = (select auth_gym_id()) and (select auth_es_staff())));
create policy hc_staff_update on public.horario_cancelaciones for update to authenticated
  using      ((select is_superadmin()) or (gym_id = (select auth_gym_id()) and (select auth_es_staff())))
  with check ((select is_superadmin()) or (gym_id = (select auth_gym_id()) and (select auth_es_staff())));
create policy hc_staff_delete on public.horario_cancelaciones for delete to authenticated
  using      ((select is_superadmin()) or (gym_id = (select auth_gym_id()) and (select auth_es_staff())));

-- ─────────────────────────────────────────────────────────────────────
-- C) audit_log — el panel inserta y lee; nadie del gym borra ni edita su rastro.
-- ─────────────────────────────────────────────────────────────────────
drop policy if exists gym_isolation on public.audit_log;
create policy audit_log_staff_insert on public.audit_log for insert to authenticated
  with check ((select is_superadmin()) or (gym_id = (select auth_gym_id()) and (select auth_es_staff())));
create policy audit_log_staff_select on public.audit_log for select to authenticated
  using ((select is_superadmin()) or (gym_id = (select auth_gym_id()) and (select auth_es_staff())));
create policy audit_log_super_update on public.audit_log for update to authenticated
  using ((select is_superadmin())) with check ((select is_superadmin()));
create policy audit_log_super_delete on public.audit_log for delete to authenticated
  using ((select is_superadmin()));

-- ─────────────────────────────────────────────────────────────────────
-- D) Filas propias del atleta. Las policies de UPDATE de reservas/waitlist/citas/
-- medidas/bitacora no tienen WITH CHECK (reusa el USING), así que el atleta podía
-- mover SU fila a otro gym. Un trigger es más claro que reescribir 5 policies:
-- solo actúa cuando app_rol = 'atleta'; panel y service role pasan intactos.
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.guard_atleta_update()
returns trigger language plpgsql set search_path to 'public','pg_temp' as $$
declare
  -- Columnas que la app del atleta realmente escribe (grep de atleta.html), por tabla.
  permitidas text[] := case tg_table_name
    when 'clientes'        then array['foto_url','web_push_subscription','push_token','push_platform','updated_at']
    when 'reservas'        then array['estado','spot']
    when 'waitlist'        then array['estado']
    else null  -- medidas / bitacora_atleta / citas: contenido libre, pero nunca gym_id ni dueño
  end;
  inmutables text[] := array['id','gym_id','cliente_id','qr_token','portal_token','created_at'];
begin
  if coalesce(auth.jwt() ->> 'app_rol', '') <> 'atleta' then
    return new;
  end if;

  if permitidas is not null then
    if (to_jsonb(new) - permitidas) is distinct from (to_jsonb(old) - permitidas) then
      raise exception 'La app del atleta no puede modificar esas columnas de %', tg_table_name
        using errcode = '42501';
    end if;
  else
    if (select jsonb_object_agg(k, to_jsonb(new) -> k) from unnest(inmutables) k)
       is distinct from (select jsonb_object_agg(k, to_jsonb(old) -> k) from unnest(inmutables) k) then
      raise exception 'La app del atleta no puede reasignar filas de %', tg_table_name
        using errcode = '42501';
    end if;
  end if;

  -- El atleta solo puede CANCELAR (nunca marcarse asistencia ni reactivar).
  -- Vía jsonb: plpgsql resuelve new.estado aunque la tabla no lo tenga (clientes) y truena.
  if tg_table_name in ('reservas','waitlist') then
    if (to_jsonb(new) ->> 'estado') is distinct from (to_jsonb(old) ->> 'estado')
       and (to_jsonb(new) ->> 'estado') <> 'cancelado' then
      raise exception 'La app del atleta solo puede cancelar' using errcode = '42501';
    end if;
  end if;

  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['clientes','reservas','waitlist','citas','medidas','bitacora_atleta'] loop
    execute format('drop trigger if exists trg_guard_atleta_update on public.%I', t);
    execute format('create trigger trg_guard_atleta_update before update on public.%I
                    for each row execute function public.guard_atleta_update()', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────
-- clases_baja_ocupacion: security definer que recibía p_gym_id sin validarlo.
-- Mismo cuerpo; solo se agrega el candado en la primera CTE.
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.clases_baja_ocupacion(p_gym_id bigint, p_horas integer default 12)
returns table(horario_id uuid, fecha date, hora text, tipo text, cliente_nombre text, cliente_id bigint,
              pago_id bigint, plan text, vence text, es_suelta boolean, es_muestra boolean)
language sql stable security definer set search_path to 'public' as $function$
  with viva as (
    select r.horario_id, r.fecha, r.cliente_nombre, r.cliente_id
    from reservas r
    where r.gym_id = p_gym_id
      -- Candado: solo el panel del MISMO gym (o superadmin). Antes cualquier JWT leía cualquier gym.
      and ((select is_superadmin())
           or (p_gym_id = (select auth_gym_id())
               and (select auth_app_rol()) in ('admin','staff','superadmin','recepcion')))
      and r.estado not in ('cancelado','bloqueado','checkin')
      and r.fecha >= current_date
      and r.fecha <= current_date + 2
  ),
  conteo as (
    select v.horario_id, v.fecha, count(*) as n,
           min(v.cliente_nombre) as unico_nombre, min(v.cliente_id) as unico_cliente
    from viva v group by v.horario_id, v.fecha
    having count(*) = 1
  ),
  sin_checkin as (
    select c.* from conteo c
    where not exists (
      select 1 from reservas r2
      where r2.horario_id = c.horario_id and r2.fecha = c.fecha and r2.estado = 'checkin'
    )
  ),
  pago_rige as (
    select s.*, p.id as pago_id, p.plan, p.vence, p.package_id, p.monto,
           row_number() over (partition by s.horario_id, s.fecha order by p.fecha desc) as rn
    from sin_checkin s
    left join pagos p
      on p.gym_id = p_gym_id
     and trim(p.cliente) = trim(s.unico_nombre)
     and coalesce(p.notas,'') <> '__sin_pago__'
     and (p.vence is null or p.vence = '' or p.vence >= to_char(current_date,'YYYY-MM-DD'))
  )
  select
    pr.horario_id, pr.fecha, h.hora, h.tipo,
    pr.unico_nombre, pr.unico_cliente, pr.pago_id, pr.plan, pr.vence,
    coalesce(pk.duration_days, 0) <= 1 as es_suelta,
    coalesce(pr.monto, -1) = 0          as es_muestra
  from pago_rige pr
  join horarios h on h.id = pr.horario_id
  left join packages pk on pk.id = pr.package_id
  where pr.rn = 1
    and pr.fecha <= current_date + (case when p_horas > 24 then 2 else 1 end)
  order by pr.fecha, h.hora;
$function$;

