set local lock_timeout='3s';
-- Production has a composite primary key. The staff session subject is the identity id.
create unique index usuarios_staff_subject_unique on public.usuarios(id);
-- A row is an explicit opt-in by operations. Clients cannot enroll another account.
create schema core_staff_mfa;
revoke all on schema core_staff_mfa from public, anon, authenticated;
grant usage on schema core_staff_mfa to service_role;
create table core_staff_mfa.factors (
  subject bigint primary key references public.usuarios(id) on delete cascade,
  secret text, enabled boolean not null default false, pending_until timestamptz,
  recovery bytea[] not null default '{}', last_step bigint not null default -1,
  challenge_hash bytea, challenge_until timestamptz,
  attempts integer not null default 0, window_start timestamptz not null default now()
);
alter table core_staff_mfa.factors enable row level security;
revoke all on core_staff_mfa.factors from public, anon, authenticated;
grant select, update on core_staff_mfa.factors to service_role;
CREATE FUNCTION core_staff_mfa.totp_step(secret text,code text) RETURNS bigint
LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
DECLARE alphabet text:='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; key bytea:=''::bytea; acc bigint:=0; bits integer:=0; n integer; i integer; delta integer; step bigint; digest bytea; offset_value integer; number bigint;
BEGIN
 IF secret IS NULL OR secret!~'^[A-Z2-7]{16,64}$' OR code IS NULL OR code!~'^[0-9]{6}$' THEN RETURN NULL; END IF;
 FOR i IN 1..length(secret) LOOP
  n:=strpos(alphabet,substr(secret,i,1))-1; acc:=(acc<<5)|n; bits:=bits+5;
  IF bits>=8 THEN bits:=bits-8; key:=key||decode(lpad(to_hex(((acc>>bits)&255)::int),2,'0'),'hex'); END IF;
  acc:=acc & ((1::bigint<<bits)-1);
 END LOOP;
 FOR delta IN -1..1 LOOP
  step:=floor(extract(epoch FROM statement_timestamp())/30)::bigint+delta;
  digest:=extensions.hmac(int8send(step),key,'sha1'); offset_value:=get_byte(digest,19)&15;
  number:=((get_byte(digest,offset_value)&127)::bigint<<24)|(get_byte(digest,offset_value+1)::bigint<<16)|(get_byte(digest,offset_value+2)::bigint<<8)|get_byte(digest,offset_value+3)::bigint;
  IF lpad((number%1000000)::text,6,'0')=code THEN RETURN step; END IF;
 END LOOP;
 RETURN NULL;
END $$;

-- Login and enrollment serialize per subject. Only the Edge service may call this.
create function public.core_staff_factor(
  p_subject bigint, p_action text, p_challenge text default null, p_code text default null,
  p_secret text default null, p_codes text[] default null
) returns jsonb language plpgsql security invoker set search_path = pg_catalog as $$
declare
  f core_staff_mfa.factors;
  ticket text;
  step bigint;
  recovery_hash bytea;
  hashes bytea[];
begin
  select * into f from core_staff_mfa.factors where subject=p_subject for update;
  if not found then
    if p_action in ('login','internal_check') then return '{"ok":true}'; end if;
    return '{"error":"El segundo factor aún no está habilitado para esta cuenta."}';
  end if;
  if p_action='internal_check' then return jsonb_build_object('ok',not f.enabled); end if;
  if p_action='login' and not f.enabled then return '{"ok":true}'; end if;
  if p_action='login' and p_challenge is null and p_code is null then
    ticket := encode(extensions.gen_random_bytes(32),'hex');
    update core_staff_mfa.factors set challenge_hash=sha256(convert_to(ticket,'UTF8')),
      challenge_until=now()+interval '3 minutes' where subject=p_subject;
    return jsonb_build_object('requires_2fa',true,'challenge',ticket);
  end if;
  if p_action='enroll' and not f.enabled then
    if p_secret is null or p_secret !~ '^[A-Z2-7]{32}$' or cardinality(p_codes) is distinct from 8 then
      raise exception 'Invalid enrollment input';
    end if;
    select array_agg(sha256(convert_to(c,'UTF8'))) into hashes from unnest(p_codes) c;
    update core_staff_mfa.factors set secret=p_secret,recovery=hashes,
      pending_until=now()+interval '10 minutes' where subject=p_subject;
    return '{"ok":true}';
  end if;
  if p_action='login' then
    if f.challenge_until is null or now() >= f.challenge_until or p_challenge is null
       or sha256(convert_to(p_challenge,'UTF8')) is distinct from f.challenge_hash then
      return '{"error":"El reto venció. Inicia sesión de nuevo."}';
    end if;
  elsif p_action='verify_enrollment' then
    if f.enabled or f.pending_until is null or now()>=f.pending_until then
      return '{"error":"Genera un nuevo código de configuración."}';
    end if;
  elsif p_action not in ('disable','regenerate_recovery_codes') or not f.enabled then
    return '{"error":"Operación no disponible."}';
  end if;
  if now() >= f.window_start + interval '5 minutes' then
    update core_staff_mfa.factors set attempts=0,window_start=now() where subject=p_subject;
  elsif f.attempts>=5 then
    return '{"error":"Espera cinco minutos antes de volver a intentar."}';
  end if;
  step := core_staff_mfa.totp_step(f.secret,p_code);
  recovery_hash := sha256(convert_to(upper(p_code),'UTF8'));
  if step is not null and step>f.last_step then
    update core_staff_mfa.factors set last_step=step where subject=p_subject;
  elsif p_action='login' and recovery_hash=any(f.recovery) then
    update core_staff_mfa.factors set recovery=array_remove(recovery,recovery_hash) where subject=p_subject;
  else
    update core_staff_mfa.factors set attempts=attempts+1 where subject=p_subject;
    if p_action='login' then return jsonb_build_object('requires_2fa',true,'challenge',p_challenge,'error','Código inválido o ya utilizado.'); end if;
    return '{"error":"Código inválido o ya utilizado."}';
  end if;
  update core_staff_mfa.factors set attempts=0,challenge_hash=null,challenge_until=null where subject=p_subject;
  if p_action='verify_enrollment' then
    update core_staff_mfa.factors set enabled=true,pending_until=null where subject=p_subject;
    update public.usuarios set totp_enabled=true,totp_enrolled_at=now() where id=p_subject;
  elsif p_action='disable' then
    update core_staff_mfa.factors set enabled=false,secret=null,recovery='{}',last_step=-1 where subject=p_subject;
    update public.usuarios set totp_enabled=false,totp_enrolled_at=null where id=p_subject;
  elsif p_action='regenerate_recovery_codes' then
    if cardinality(p_codes) is distinct from 8 then raise exception 'Invalid recovery codes'; end if;
    select array_agg(sha256(convert_to(c,'UTF8'))) into hashes from unnest(p_codes) c;
    update core_staff_mfa.factors set recovery=hashes where subject=p_subject;
  end if;
  return '{"ok":true}';
end $$;
revoke all on function public.core_staff_factor(bigint,text,text,text,text,text[]) from public, anon, authenticated;
grant execute on function public.core_staff_factor(bigint,text,text,text,text,text[]) to service_role;
revoke all on function core_staff_mfa.totp_step(text,text) from public, anon, authenticated;
grant execute on function core_staff_mfa.totp_step(text,text) to service_role;
