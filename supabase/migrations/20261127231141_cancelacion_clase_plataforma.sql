-- Los pagos históricos sólo identifican al socio por nombre. Ante homónimos o una
-- reserva cubierta por una plataforma, recepción puede cancelar sin tocar pagos.
CREATE OR REPLACE FUNCTION public.cancelar_clase_baja_ocupacion(p_horario_id uuid, p_fecha date, p_dias_credito integer DEFAULT 30)
RETURNS TABLE(ok boolean, mensaje text, cliente text, credito_hasta text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_gym bigint := (select auth_gym_id());
  v_rol text := (select auth_app_rol());
  v_clase public.horarios%rowtype;
  v_dia text := (array['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'])[extract(dow from p_fecha)::int+1];
  v_grupo uuid[];
  v_base uuid;
  v_excepcion uuid;
  v_reserva public.reservas%rowtype;
  v_pago public.pagos%rowtype;
  v_nuevo text;
begin
  if v_gym is null or (v_rol in ('admin','staff','superadmin','recepcion')) is not true then
    return query select false,'Sin permiso para cancelar clases.',null::text,null::text; return;
  end if;
  select * into v_clase from public.horarios h where h.id=p_horario_id and h.gym_id=v_gym;
  if not found then
    return query select false,'Esa clase no es de tu negocio.',null::text,null::text; return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(concat_ws('/',v_gym,p_fecha,v_clase.hora),0));
  if (coalesce(v_clase.fecha,'')='' and v_clase.dia is distinct from v_dia)
     or (coalesce(v_clase.fecha,'')<>'' and v_clase.fecha<>p_fecha::text) then
    return query select false,'La clase no corresponde a ese día.',null::text,null::text; return;
  end if;
  v_grupo:=array[v_clase.id];
  -- Como en mostrador, una excepción sólo hereda la plantilla si ambos lados son inequívocos.
  select (array_agg(h.id))[1] into v_base from public.horarios h where h.gym_id=v_gym and h.hora=v_clase.hora
    and h.dia=v_dia and coalesce(h.fecha,'')='' having count(*)=1;
  select (array_agg(h.id))[1] into v_excepcion from public.horarios h where h.gym_id=v_gym and h.hora=v_clase.hora
    and h.fecha=p_fecha::text having count(*)=1;
  if v_base is not null and v_excepcion is not null then
    v_grupo:=array[v_base,v_excepcion];
    v_clase.id:=v_excepcion;
  end if;
  -- Un segundo clic o una reserva posterior al aviso exige volver a leer la clase.
  perform 1 from public.reservas r where r.gym_id=v_gym and r.horario_id=any(v_grupo)
    and r.fecha=p_fecha and r.estado not in ('cancelado','bloqueado') order by r.id for update;
  if exists(select 1 from public.reservas r where r.gym_id=v_gym and r.horario_id=any(v_grupo)
            and r.fecha=p_fecha and r.estado='checkin') then
    return query select false,'Alguien ya hizo check-in: la clase no se cancela.',null::text,null::text; return;
  end if;
  if (select count(*) from public.reservas r where r.gym_id=v_gym and r.horario_id=any(v_grupo)
      and r.fecha=p_fecha and r.estado not in ('cancelado','bloqueado')) <> 1 then
    return query select false,'Cambió la lista de la clase. Actualiza antes de cancelar.',null::text,null::text; return;
  end if;
  select r.* into strict v_reserva from public.reservas r where r.gym_id=v_gym and r.horario_id=any(v_grupo)
    and r.fecha=p_fecha and r.estado not in ('cancelado','bloqueado');
  insert into public.horario_cancelaciones (horario_id,fecha,gym_id,motivo)
    values (v_clase.id,p_fecha,v_gym,'Baja ocupación') on conflict do nothing;
  update public.reservas set estado='cancelado' where id=v_reserva.id and gym_id=v_gym;
  if v_reserva.origen_mostrador is not null and v_reserva.origen_mostrador<>'mostrador' then
    return query select true,'Clase cancelada. La plataforma cubría la reserva.',v_reserva.cliente_nombre,null::text; return;
  end if;
  if (select count(*) from public.clientes c where c.gym_id=v_gym
      and public._norm_nombre(c.nombre)=public._norm_nombre(v_reserva.cliente_nombre))>1 then
    return query select true,'Clase cancelada. Hay socios con el mismo nombre. Revisa el crédito en Clientes.',v_reserva.cliente_nombre,null::text; return;
  end if;
  select p.* into v_pago from public.pagos p where p.gym_id=v_gym and trim(p.cliente)=trim(v_reserva.cliente_nombre)
    and coalesce(p.notas,'')<>'__sin_pago__' order by p.fecha desc,p.id desc limit 1 for update;
  if not found then
    return query select true,'Clase cancelada. No se encontró un pago personal para extender.',v_reserva.cliente_nombre,null::text; return;
  end if;
  v_nuevo:=to_char(greatest(current_date,coalesce(nullif(v_pago.vence,'')::date,current_date))+p_dias_credito,'YYYY-MM-DD');
  update public.pagos set vence=v_nuevo,notas=trim(both ' ' from coalesce(notas,'')||
    ' [Crédito por clase cancelada del '||to_char(p_fecha,'DD/MM')||']') where id=v_pago.id and gym_id=v_gym;
  return query select true,'Clase cancelada y crédito aplicado.',v_reserva.cliente_nombre,v_nuevo;
end;
$function$;
