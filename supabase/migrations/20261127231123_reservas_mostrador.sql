-- El origen describe quién cubre esta clase. NULL conserva el comportamiento histórico.
alter table public.reservas add column origen_mostrador text check (origen_mostrador in ('mostrador','TotalPass','Nessty','Wellhub','ClassPass','Otra plataforma'));
alter table public.waitlist add column origen_mostrador text check (origen_mostrador in ('mostrador','TotalPass','Nessty','Wellhub','ClassPass','Otra plataforma'));

create function public.core_validar_origen_mostrador() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.origen_mostrador is distinct from new.origen_mostrador then
    raise exception 'El origen de una reserva confirmada no puede cambiar.' using errcode='23514';
  end if;
  if tg_op = 'INSERT' and new.origen_mostrador is not null and
    (public.auth_app_rol() in ('admin','staff','recepcion','superadmin')
      and (new.gym_id=public.auth_gym_id() or public.is_superadmin())) is not true then
    raise exception 'Sólo recepción puede identificar una reserva de mostrador.' using errcode='42501';
  end if;
  return new;
end;
$$;
create trigger core_origen_mostrador before insert or update of origen_mostrador on public.reservas
  for each row execute function public.core_validar_origen_mostrador();
create trigger core_origen_mostrador before insert or update of origen_mostrador on public.waitlist
  for each row execute function public.core_validar_origen_mostrador();

-- La asistencia externa cuenta como asistencia, pero no gasta una clase personal.
drop trigger trg_paquete_consumo on public.reservas;
create trigger trg_paquete_consumo before insert or update of estado on public.reservas
  for each row when (new.origen_mostrador is null or new.origen_mostrador = 'mostrador')
  execute function public.trg_reserva_consumo_paquete();

-- La sesión efectiva comprende plantilla y excepción de ese día. La misma llave
-- serializa mostrador y portal aunque lleguen desde dos dispositivos distintos.
create function public.core_validar_lugar_clase() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  h public.horarios%rowtype;
  v_dia text := (array['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'])[extract(dow from new.fecha)::int+1];
  base_id uuid;
  sesion_ids uuid[];
  claims jsonb := auth.jwt();
  es_personal boolean := false;
  compra_publica boolean := coalesce(claims->>'role'='service_role' and tg_table_name='reservas' and tg_op='INSERT'
    and new.estado='reservado' and new.cliente_id is not null and new.origen_mostrador is null,false);
begin
  if new.estado='cancelado' or new.horario_id is null or new.gym_id is null then return new; end if;
  if claims->>'app_rol' in ('admin','staff','recepcion','superadmin') then
    es_personal := (public.auth_app_rol() in ('admin','staff','recepcion','superadmin') and
      (new.gym_id=public.auth_gym_id() or public.is_superadmin())) is true;
    if not es_personal then raise exception 'Sede incorrecta.' using errcode='42501'; end if;
  elsif not compra_publica and (claims->>'app_rol'='atleta' and claims->>'gym_id'=new.gym_id::text and
      (claims->>'cliente_id'=new.cliente_id::text or claims->>'portal_token'=new.portal_token)) is not true then
    -- Integraciones existentes sin sesión de personal o de atleta mantienen
    -- sus políticas. Nunca pueden registrar una reserva externa.
    return new;
  end if;
  select * into h from public.horarios where id=new.horario_id and gym_id=new.gym_id;
  if not found then
    if compra_publica then raise exception 'La clase ya no está disponible.' using errcode='23505'; end if;
    if new.origen_mostrador is not null then raise exception 'La clase ya no está disponible.'; end if;
    return new;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(concat_ws('/',new.gym_id,new.fecha,h.hora),0));
  if coalesce(h.fecha,'')='' then
    base_id := h.id;
    -- Dos grupos simultáneos conservan su capacidad propia. Sólo se une una
    -- excepción a la plantilla cuando el horario de origen es inequívoco.
    if (select count(*) from public.horarios x where x.gym_id=new.gym_id and x.hora=h.hora and x.dia=v_dia and coalesce(x.fecha,'')='')=1
      and (select count(*) from public.horarios x where x.gym_id=new.gym_id and x.hora=h.hora and x.fecha=new.fecha::text)=1 then
      select x.* into h from public.horarios x where x.gym_id=new.gym_id and x.hora=h.hora and x.fecha=new.fecha::text;
    end if;
  else
    if (select count(*) from public.horarios x where x.gym_id=new.gym_id and x.hora=h.hora and x.fecha=new.fecha::text)=1 then
      select (array_agg(x.id))[1] into base_id from public.horarios x
        where x.gym_id=new.gym_id and x.hora=h.hora and x.dia=v_dia and coalesce(x.fecha,'')='' having count(*)=1;
    end if;
  end if;
  sesion_ids := array_remove(array[h.id,base_id],null);
  if (new.origen_mostrador is not null or compra_publica) and (
      (coalesce(h.fecha,'')='' and h.dia is distinct from v_dia) or (coalesce(h.fecha,'')<>'' and h.fecha<>new.fecha::text)
      or (new.horario_id<>h.id and tg_op='INSERT') or h.tipo='CERRADO' or exists(select 1 from public.horario_cancelaciones c where c.gym_id=new.gym_id and c.fecha=new.fecha and c.horario_id=h.id)
      or not exists(select 1 from public.clientes c where c.gym_id=new.gym_id and c.id=new.cliente_id)
  ) then
    if compra_publica then raise exception 'La clase o el socio ya no están disponibles.' using errcode='23505'; end if;
    raise exception 'La clase o el socio ya no están disponibles en esta sede.';
  end if;
  if tg_table_name='reservas' then
    if new.cliente_id is not null and exists(select 1 from public.reservas r where r.gym_id=new.gym_id and r.fecha=new.fecha and r.horario_id=any(sesion_ids)
       and r.estado<>'cancelado' and (r.cliente_id=new.cliente_id or (r.cliente_id is null and lower(trim(r.cliente_nombre))=lower(trim(new.cliente_nombre))))) then
      raise exception 'El socio ya tiene un lugar en esta clase.' using errcode='23505';
    end if;
    if coalesce(h.cupo,0)>0 and (not es_personal or (new.origen_mostrador is not null and coalesce(current_setting('velum.sobrecupo',true),'')<>'confirmado'))
      and (select count(*) from public.reservas r where r.gym_id=new.gym_id and r.fecha=new.fecha and r.horario_id=any(sesion_ids) and r.estado<>'cancelado')>=h.cupo then
      if compra_publica then raise exception 'El último lugar ya se ocupó.' using errcode='23505'; end if;
      raise exception 'El último lugar ya se ocupó. Actualiza la lista.';
    end if;
  elsif new.cliente_id is not null and new.estado='espera' then
    if exists(select 1 from public.waitlist w where w.gym_id=new.gym_id and w.fecha=new.fecha and w.horario_id=any(sesion_ids) and w.estado='espera' and w.cliente_id=new.cliente_id)
      or exists(select 1 from public.reservas r where r.gym_id=new.gym_id and r.fecha=new.fecha and r.horario_id=any(sesion_ids) and r.estado<>'cancelado' and r.cliente_id=new.cliente_id) then
      raise exception 'El socio ya está anotado para esta clase.' using errcode='23505';
    end if;
    select coalesce(max(w.posicion),0)+1 into new.posicion from public.waitlist w where w.gym_id=new.gym_id and w.fecha=new.fecha and w.horario_id=any(sesion_ids) and w.estado='espera';
  end if;
  return new;
end;
$$;
revoke all on function public.core_validar_lugar_clase() from public, anon, authenticated;
create trigger core_validar_lugar before insert on public.reservas for each row execute function public.core_validar_lugar_clase();
create trigger core_validar_reingreso before update of estado on public.reservas
  for each row when (old.estado='cancelado' and new.estado<>'cancelado') execute function public.core_validar_lugar_clase();
create trigger core_validar_lugar before insert on public.waitlist for each row execute function public.core_validar_lugar_clase();

create function public.core_reservar_mostrador(p_gym bigint,p_clase uuid,p_socio bigint,p_fecha date,p_origen text,p_estado text,p_sobrecupo boolean default false,p_espera uuid default null)
returns void language plpgsql security invoker set search_path='' as $$
declare
  h public.horarios%rowtype;
  nombre text;
  v_dia text:=(array['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'])[extract(dow from p_fecha)::int+1];
  w public.waitlist%rowtype;
begin
  if (public.auth_app_rol() in ('admin','staff','recepcion','superadmin') and
     (p_gym=public.auth_gym_id() or public.is_superadmin())) is not true then raise exception 'Acceso denegado.' using errcode='42501'; end if;
  if p_estado not in ('reservado','checkin','espera') or p_estado is null or p_origen is null then raise exception 'Reserva no válida.'; end if;
  select * into strict h from public.horarios where id=p_clase and gym_id=p_gym;
  select c.nombre into strict nombre from public.clientes c where c.id=p_socio and c.gym_id=p_gym;
  if p_espera is not null then
    select * into strict w from public.waitlist where id=p_espera and gym_id=p_gym and horario_id=p_clase and fecha=p_fecha and cliente_id=p_socio for update;
    if w.estado<>'espera' or p_estado<>'reservado' then raise exception 'La lista de espera ya cambió.'; end if;
    p_origen := coalesce(w.origen_mostrador,'mostrador');
    p_sobrecupo := false;
  end if;
  if p_estado='espera' then
    insert into public.waitlist(gym_id,horario_id,cliente_id,cliente_nombre,fecha,clase_tipo,clase_hora,clase_dia,estado,posicion,origen_mostrador)
    values(p_gym,p_clase,p_socio,nombre,p_fecha,h.tipo,h.hora,v_dia,'espera',1,p_origen);
  else
    perform pg_catalog.set_config('velum.sobrecupo',case when p_sobrecupo then 'confirmado' else '' end,true);
    insert into public.reservas(gym_id,horario_id,cliente_id,cliente_nombre,fecha,clase_tipo,clase_hora,clase_dia,estado,origen_mostrador)
    values(p_gym,p_clase,p_socio,nombre,p_fecha,h.tipo,h.hora,v_dia,p_estado,p_origen);
    if p_espera is not null then update public.waitlist set estado='promovido' where id=w.id; end if;
  end if;
end;
$$;
revoke all on function public.core_reservar_mostrador(bigint,uuid,bigint,date,text,text,boolean,uuid) from public,anon;
grant execute on function public.core_reservar_mostrador(bigint,uuid,bigint,date,text,text,boolean,uuid) to authenticated;

-- Mostrar el hito en su fila de asistencia confirmada evita generar una alerta
-- nueva en cada recarga. Usamos el ID de socio para distinguir homónimos.
create index reservas_hitos_socio_idx on public.reservas (gym_id,cliente_id,fecha,created_at,id) where estado='checkin';
create function public.core_hitos_asistencia(p_gym bigint,p_reservas uuid[])
returns table(reserva_id uuid,asistencias bigint) language sql stable security invoker set search_path='' as $$
  with socios as (
    select distinct c.id,c.nombre from public.reservas r
    join public.clientes c on c.id=r.cliente_id and c.gym_id=r.gym_id
    where r.gym_id=p_gym and r.id=any(p_reservas) and r.estado='checkin'
      and public.auth_app_rol() in ('admin','staff','recepcion','superadmin') and (p_gym=public.auth_gym_id() or public.is_superadmin())
  )
  select x.id,x.n from socios s cross join lateral (
    select r.id,r.fecha,row_number() over (order by r.fecha,r.created_at,r.id) n
    from public.reservas r where r.gym_id=p_gym and r.estado='checkin' and
      (r.cliente_id=s.id or (r.cliente_id is null and public._norm_nombre(r.cliente_nombre)=public._norm_nombre(s.nombre)))
    order by r.fecha,r.created_at,r.id limit 100
  ) x where x.id=any(p_reservas) and x.n in (1,100)
    -- Con datos antiguos por nombre hay que poder distinguir a la persona.
    and not exists (
      select 1 from public.clientes c where c.gym_id=p_gym and c.id<>s.id and public._norm_nombre(c.nombre)=public._norm_nombre(s.nombre)
        and exists(select 1 from public.reservas r where r.gym_id=p_gym and r.cliente_id is null and r.estado='checkin'
          and r.fecha<=x.fecha and public._norm_nombre(r.cliente_nombre)=public._norm_nombre(s.nombre))
    )
    -- Una entrada de kiosco no siempre corresponde a una clase. Ante registros
    -- con clase que no pueden enlazarse, evitamos afirmar un total incierto.
    and not exists (
      select 1 from public.qr_checkins q where q.gym_id=p_gym and q.fecha<=x.fecha and nullif(trim(q.clase),'') is not null
        and public._norm_nombre(q.nombre)=public._norm_nombre(s.nombre)
        and not exists(select 1 from public.reservas r where r.gym_id=p_gym and r.fecha=q.fecha and r.estado='checkin'
          and public._norm_nombre(r.clase_tipo)=public._norm_nombre(q.clase) and
          (r.cliente_id=s.id or (r.cliente_id is null and public._norm_nombre(r.cliente_nombre)=public._norm_nombre(s.nombre))))
    )
$$;
revoke all on function public.core_hitos_asistencia(bigint,uuid[]) from public,anon;
grant execute on function public.core_hitos_asistencia(bigint,uuid[]) to authenticated;

-- Las reservas cubiertas por plataforma tampoco apartan saldo del paquete.
CREATE OR REPLACE FUNCTION public.estado_paquete_cliente(p_gym bigint, p_cliente_id bigint, p_nombre text, p_fecha date)
 RETURNS TABLE(membresia boolean, pago_id bigint, plan text, totales integer, usadas integer, restantes integer, vence text, pendientes integer, sin_clases boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with k as (
    select _norm_nombre(c.nombre) k from clientes c where c.id = p_cliente_id and c.gym_id = p_gym
    union select _norm_nombre(p_nombre)
  ),
  mine as (
    select p.* from pagos p
    where p.gym_id = p_gym and _norm_nombre(p.cliente) in (select k from k)
      and coalesce(p.notas,'') <> '__sin_pago__'
  ),
  memb as (
    select exists(select 1 from mine where coalesce(clases_totales,0) = 0
                  and _fecha_pago(vence) >= p_fecha) v
  ),
  pk as (select * from mine where id = paquete_para_consumo(p_gym, p_cliente_id, p_nombre, p_fecha)),
  disp as (
    select coalesce(sum(clases_totales - coalesce(clases_usadas,0)),0)::int r from mine
    where clases_totales > 0 and coalesce(clases_usadas,0) < clases_totales
      and (_fecha_pago(vence) is null or _fecha_pago(vence) >= p_fecha)
  ),
  pend as (
    select count(*)::int n from reservas r
    where r.gym_id = p_gym and r.estado = 'reservado' and r.fecha >= p_fecha
      and (r.origen_mostrador is null or r.origen_mostrador='mostrador')
      and (r.cliente_id = p_cliente_id or _norm_nombre(r.cliente_nombre) in (select k from k))
  ),
  ultimo as (  -- el último paquete de clases (aunque esté agotado o vencido), para mostrarlo
    select * from mine where clases_totales > 0
    order by _fecha_pago(fecha) desc nulls last, id desc limit 1
  )
  select (select v from memb),
         coalesce((select id from pk), (select id from ultimo)),
         coalesce((select plan from pk), (select plan from ultimo)),
         coalesce((select clases_totales from pk), (select clases_totales from ultimo)),
         coalesce((select clases_usadas from pk), (select clases_usadas from ultimo)),
         (select r from disp),
         coalesce((select vence from pk), (select vence from ultimo)),
         (select n from pend),
         -- sin clases = tiene historial de paquetes, ninguno disponible y sin membresía por tiempo
         (not (select v from memb)) and (select r from disp) = 0 and exists(select 1 from mine where clases_totales > 0)
$function$;
