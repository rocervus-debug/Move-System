-- No se crea una sesión ordinaria para leer una cuenta cancelada.
create schema core_acceso_privado;
revoke all on schema core_acceso_privado from public, anon, authenticated;
grant usage on schema core_acceso_privado to service_role;

alter table public.gyms add column exportacion_hasta timestamptz;
update public.gyms set exportacion_hasta = subscription_updated_at + interval '720 hours'
where subscription_status = 'canceled' and subscription_updated_at is not null;

create function core_acceso_privado.plazo_exportacion() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.subscription_status is distinct from 'canceled' then
    new.exportacion_hasta := null;
  elsif tg_op = 'INSERT' or old.subscription_status is distinct from 'canceled' then
    new.exportacion_hasta := now() + interval '720 hours';
  else
    new.exportacion_hasta := old.exportacion_hasta;
  end if;
  return new;
end $$;
create trigger core_plazo_exportacion before insert or update of subscription_status, exportacion_hasta
on public.gyms for each row execute function core_acceso_privado.plazo_exportacion();

create table core_acceso_privado.permisos (
  huella text primary key check(length(huella)=64),
  finalidad text not null check(finalidad in ('clave','lectura')),
  usuario_id bigint not null references public.usuarios(id) on delete cascade,
  correo text not null, gym_id bigint, rol text not null,
  firma_clave text not null, vence timestamptz not null
);
create index on core_acceso_privado.permisos(vence);
grant select, insert, delete on core_acceso_privado.permisos to service_role;

create function public.core_crear_permiso(p_usuario bigint,p_finalidad text,p_huella text,p_firma text)
returns timestamptz language plpgsql set search_path = '' as $$
declare u public.usuarios%rowtype; plazo timestamptz;
begin
  select * into u from public.usuarios where id=p_usuario and activo for share;
  if not found or u.gym_id is null or u.pw_hash is null or
     encode(extensions.digest(u.pw_hash,'sha256'),'hex') is distinct from p_firma then return null; end if;
  if p_finalidad='lectura' and u.rol='admin' then
    select least(g.exportacion_hasta,now()+interval '30 minutes') into plazo
    from public.gyms g where g.id=u.gym_id and g.subscription_status='canceled' and g.exportacion_hasta>now();
  elsif p_finalidad='clave' and u.rol in ('admin','recepcion','staff','coach') then
    plazo := now()+interval '20 minutes';
  end if;
  if plazo is null then return null; end if;
  delete from core_acceso_privado.permisos where vence<=now();
  insert into core_acceso_privado.permisos values(p_huella,p_finalidad,u.id,u.email,u.gym_id,u.rol,p_firma,plazo);
  return plazo;
end $$;

create function public.core_confirmar_clave(p_huella text,p_hash text)
returns boolean language plpgsql set search_path = '' as $$
declare permiso core_acceso_privado.permisos%rowtype; u public.usuarios%rowtype;
begin
  select * into permiso from core_acceso_privado.permisos where huella=p_huella and finalidad='clave' and vence>now();
  if not found then return false; end if;
  select * into u from public.usuarios where id=permiso.usuario_id for update;
  if not found or not u.activo or u.email is distinct from permiso.correo or u.rol is distinct from permiso.rol
    or u.gym_id is distinct from permiso.gym_id or encode(extensions.digest(u.pw_hash,'sha256'),'hex') is distinct from permiso.firma_clave
    or permiso.vence<=clock_timestamp() then return false; end if;
  update public.usuarios set pw_hash=p_hash,password=p_hash,pw_version=greatest(coalesce(pw_version,1)+1,2)
  where id=u.id;
  delete from core_acceso_privado.permisos where usuario_id=u.id;
  return true;
end $$;

create function public.core_exportar_pagina(p_huella text,p_seccion text,p_despues text default '')
returns jsonb language plpgsql stable set search_path = '' as $$
declare negocio bigint; campos text; filas jsonb;
begin
  select u.gym_id into negocio from core_acceso_privado.permisos p
  join public.usuarios u on u.id=p.usuario_id and u.activo and u.rol='admin' and u.rol=p.rol and u.email=p.correo and u.gym_id=p.gym_id
  join public.gyms g on g.id=u.gym_id and g.subscription_status='canceled' and g.exportacion_hasta>now()
  where p.huella=p_huella and p.finalidad='lectura' and p.vence>now()
    and encode(extensions.digest(u.pw_hash,'sha256'),'hex')=p.firma_clave;
  if negocio is null then return null; end if;
  -- Sólo proyecciones fijas. Nunca exportar credenciales, tokens de portal o eventos privados de proveedores.
  if p_seccion='gimnasio' then
    if p_despues<>'' then return '[]'::jsonb; end if;
    return (select jsonb_build_array(to_jsonb(t)) from (select id,nombre,slug,owner_email,rfc,razon_social,regimen_fiscal,uso_cfdi,cp_fiscal,email_fiscal,created_at from public.gyms where id=negocio) t);
  end if;
  if p_seccion='tienda' then
    if p_despues<>'' then return '[]'::jsonb; end if;
    select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into filas from
      (select gym_id as id,slug,is_enabled,mode,description,highlights,about_html,primary_color,hero_image_url,hero_video_url,
        social_instagram,social_facebook,social_whatsapp,social_tiktok,testimonials,gallery_urls,promo_banner_text,
        show_schedule,show_coaches,faqs,address,city,state,country,postal_code,hours_text,theme,reserva_modo,semanas_visibles
       from public.gym_storefront where gym_id=negocio)t;
    return filas;
  end if;
  if p_seccion='identidad' then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.id::text collate "C"),'[]'::jsonb) into filas from
      (select id,key,value from public.gym_config where gym_id=negocio and key in
        ('gym_nombre','gym_color','gym_color_primario','gym_logo','gym_logo_url','gym_tagline','gym_theme','gym_descripcion')
       and id::text collate "C">p_despues order by id::text collate "C" limit 200)t;
    return filas;
  end if;
  if p_seccion='bitacora_atleta' then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.id::text collate "C"),'[]'::jsonb) into filas
    from (select b.id,(select c.id from public.clientes c where c.gym_id=negocio and c.qr_token=b.qr_token order by c.id limit 1) cliente_id,
      b.fecha,b.tipo,b.ejercicio,b.series,b.reps,b.peso,b.unidad_peso,b.duracion_min,b.distancia,b.unidad_distancia,b.notas
      from public.bitacora_atleta b where b.gym_id=negocio and b.id::text collate "C">p_despues order by b.id::text collate "C" limit 200)t;
    return filas;
  end if;
  campos := case p_seccion
    when 'clientes' then 'id,nombre,telefono,email,cumpleanos,notas,numero_cliente,nivel,created_at,updated_at'
    when 'packages' then 'id,name,description,price_mxn,currency,duration_days,num_classes,unlimited_classes,is_active,billing_type,billing_interval,created_at'
    when 'pagos' then 'id,cliente,monto,fecha,plan,metodo,vence,notas,telefono,clases_totales,clases_usadas,package_id,discount_mxn,source,velum_commission_mxn,net_to_gym_mxn,stripe_fee_mxn'
    when 'horarios' then 'id,dia,hora,tipo,coach_id,coach_nombre,cupo,notas,fecha,coaches_extra'
    when 'reservas' then 'id,horario_id,cliente_id,cliente_nombre,fecha,clase_tipo,clase_hora,estado,created_at,spot,pago_id,cancelacion_tardia'
    when 'asistencias' then 'id,cliente_id,fecha,hora,metodo,created_at'
    when 'qr_checkins' then 'id,fecha,clase,coach,nombre,created_at'
    when 'usuarios' then 'id,nombre,email,rol,activo,created_at'
    when 'coaches' then 'id,nombre,tel,email,rol,clases,activo,notas,usuario_id'
    when 'gastos' then 'id,descripcion,monto,categoria,fecha,notas,recurrente,dia_recurrencia'
    when 'programas' then 'id,tipo,fecha,contenido,notas'
    when 'medidas' then 'id,cliente_id,fecha,peso_kg,grasa_pct,cintura_cm,cadera_cm,pecho_cm,brazo_cm,notas'
    when 'evaluaciones' then 'id,cliente,fecha,coach,tipo,peso,altura,objetivo,notas'
    when 'visitas' then 'id,nombre,telefono,monto,fecha,metodo,notas'
    when 'leads' then 'id,name,phone,email,source,interest,status,last_contact,next_followup,notes,assigned_to,canal,historial'
    when 'campanas' then 'id,nombre,canal,estado,inicio,fin,leads_count,conversion,notas,presupuesto,objetivo'
    when 'citas' then 'id,recurso_id,cliente_id,cliente_nombre,fecha,hora_inicio,duracion_min,protocolo_id,protocolo,estado,notas'
    when 'waitlist' then 'id,horario_id,cliente_id,cliente_nombre,fecha,clase_tipo,clase_hora,posicion,estado'
    when 'cliente_notas' then 'id,cliente,fecha,tipo,nota'
    when 'member_subscriptions' then 'id,cliente_id,package_id,cliente_nombre,customer_email,status,amount_cents,interval,current_period_end,cancel_at_period_end,canceled_at'
    when 'storefront_orders' then 'id,package_id,customer_email,customer_name,customer_phone,amount_cents,application_fee_cents,currency,status,cliente_id,created_at,paid_at'
    when 'horario_cancelaciones' then 'id,horario_id,fecha,motivo'
    when 'recursos' then 'id,nombre,tipo,duracion_min,activo,sort_order'
    when 'protocolos' then 'id,nombre,pasos,activo'
    when 'config_programas' then 'id,tipo,objetivo,equipo,bloque,nivel,notas,activa,dias_semana,plantilla_ejemplo'
    when 'solicitudes' then 'id,titulo,tipo,quien,vence,estado,notas'
    when 'contenidos' then 'id,dia,tipo,titulo,fecha'
    when 'coach_tarifas' then 'id,coach_id,anio,mes,tarifa'
    when 'nomina_tabulador' then 'id,desde,hasta,monto,orden'
    when 'storefront_leads' then 'id,type,visitor_name,visitor_email,visitor_phone,preferred_day,preferred_time,message,package_id,status,notes,created_at'
    when 'storefront_listings' then 'id,package_id,is_public,sort_order,is_featured,badge_text,public_name,public_description,features_list'
    else null end;
  if campos is null then raise exception 'Sección no disponible'; end if;
  execute format('select coalesce(jsonb_agg(to_jsonb(t) order by t.id::text collate "C"),''[]''::jsonb) from
    (select %s from public.%I where gym_id=%s and id::text collate "C">$2 order by id::text collate "C" limit 200) t',campos,p_seccion,case when p_seccion='medidas' then '$1::text' else '$1' end)
  into filas using negocio,p_despues;
  return filas;
end $$;
revoke all on function public.core_crear_permiso(bigint,text,text,text),public.core_confirmar_clave(text,text),public.core_exportar_pagina(text,text,text) from public,anon,authenticated;
grant execute on function public.core_crear_permiso(bigint,text,text,text),public.core_confirmar_clave(text,text),public.core_exportar_pagina(text,text,text) to service_role;

-- Una sesión ordinaria abierta antes de la baja tampoco puede escribir a través
-- de PostgREST. Los webhooks y las tareas sin sesión de personal siguen su curso.
create function core_acceso_privado.solo_lectura_cancelado() returns trigger
language plpgsql security definer set search_path = '' as $$
declare sesion jsonb := auth.jwt();
begin
  if sesion->>'role'='authenticated' and sesion->>'app_rol' is not null
     and exists(select 1 from public.gyms g where g.id::text=sesion->>'gym_id'
          and g.subscription_status='canceled' and not coalesce(g.acceso_garantizado,false)) then
    raise insufficient_privilege using message='El gimnasio está en modo de sólo lectura.';
  end if;
  return null;
end $$;
revoke all on function core_acceso_privado.solo_lectura_cancelado() from public,anon,authenticated;
do $$ declare t record;
begin
  for t in select c.table_name from information_schema.columns c
    join information_schema.tables r using(table_schema,table_name)
    where c.table_schema='public' and r.table_type='BASE TABLE' and c.column_name='gym_id'
    union select 'gyms'
  loop
    execute format('create trigger core_solo_lectura before insert or update or delete on public.%I for each statement execute function core_acceso_privado.solo_lectura_cancelado()',t.table_name);
  end loop;
end $$;
revoke all on core_acceso_privado.permisos from public,anon,authenticated;

create function core_acceso_privado.cerrar_lectura() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from core_acceso_privado.permisos where gym_id=new.id and finalidad='lectura';
  return new;
end $$;
revoke all on function core_acceso_privado.cerrar_lectura() from public,anon,authenticated;
create trigger core_cerrar_lectura after update of subscription_status on public.gyms
for each row when (old.subscription_status='canceled' and new.subscription_status is distinct from 'canceled')
execute function core_acceso_privado.cerrar_lectura();
