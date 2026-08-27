-- 20260826_rol_recepcion.sql
-- Agrega el rol 'recepcion' (front-desk) al modelo de permisos.
--
-- CRITERIO: recepción opera el gym al 100% (clientes, reservas, horario, CRM, COBRAR)
-- pero NO ve agregados de dinero (ingresos, balance, gastos, nómina, revenue, depósitos).
-- Ve el pago INDIVIDUAL de un cliente (lo necesita para cobrar y validar vigencia);
-- nunca la SUMA.
--
-- DECISIÓN DE ROY (2026-08-26): recepción tiene acceso COMPLETO a `pagos`.
-- La policy `pagos.gym_isolation` es FOR ALL, así que hereda INSERT + UPDATE + DELETE.
-- Implicación aceptada conscientemente: recepción puede editar o borrar un pago que
-- acaba de registrar. Si algún día se quiere cerrar, hay que partir esa policy por
-- comando (INSERT sí / UPDATE-DELETE no), no cambiar el allowlist.
--
-- GRUPO A (este archivo las modifica): tablas operativas → se agrega 'recepcion' al allowlist.
-- GRUPO B (NO se tocan, recepción queda denegada por omisión): gastos, commission_payouts,
--   storefront_orders, storefront_carts, storefront_visits, storefront_leads,
--   storefront_listings, gym_storefront, ia_conversations_public.
-- GRUPO C: usuarios → policy nueva de AUTO-LECTURA (ver §2 abajo, es un blocker real).
--
-- Patrón de reescritura dinámica tomado de 20260622_rls_initplan_wrap_stable_helpers.sql:
-- se reemplaza SOLO el literal del array, preservando el resto de la expresión intacta
-- (incluidos los wrappers (SELECT fn()) del initplan y los OR de portal_token/qr_token).
-- Esto elimina el riesgo de transcribir mal 30 policies a mano.
--
-- IDEMPOTENTE: si ya se aplicó, el replace no encuentra nada y el conteo da 0 → no truena.
--
-- NOTA: sin begin/commit explícitos — apply_migration ya envuelve todo en una
-- transacción, y un commit anidado la cerraría antes de tiempo.

-- ═══════════════════════════════════════════════════════════════════════
-- §1 · GRUPO A — agregar 'recepcion' al allowlist de tablas operativas
-- ═══════════════════════════════════════════════════════════════════════
do $mig$
declare
  r          record;
  v_qual     text;
  v_check    text;
  v_old      text := $o$ARRAY['admin'::text, 'staff'::text, 'superadmin'::text]$o$;
  v_new      text := $n$ARRAY['admin'::text, 'staff'::text, 'superadmin'::text, 'recepcion'::text]$n$;
  v_sql      text;
  v_count    int  := 0;
  v_esperado int  := 30;
begin
  for r in
    select p.polname, c.relname,
           pg_get_expr(p.polqual,      p.polrelid) as qual,
           pg_get_expr(p.polwithcheck, p.polrelid) as wcheck
    from pg_policy p
    join pg_class     c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    -- Allowlist explícito de tablas: nada fuera de esta lista puede ser tocado.
    where c.relname = any (array[
      'clientes','pagos','leads','member_subscriptions','reservas','waitlist',
      'citas','medidas','bitacora_atleta','gym_config','protocolos','recursos'
    ])
    order by c.relname, p.polname
  loop
    v_qual  := replace(coalesce(r.qual,   ''), v_old, v_new);
    v_check := replace(coalesce(r.wcheck, ''), v_old, v_new);

    -- Si el literal no estaba presente, la policy no usa el allowlist → no tocarla.
    if coalesce(r.qual,'') = v_qual and coalesce(r.wcheck,'') = v_check then
      continue;
    end if;

    v_sql := format('alter policy %I on public.%I', r.polname, r.relname);
    if r.wcheck is not null then
      -- OJO: en policies FOR ALL / INSERT, Postgres exige repetir USING cuando hay WITH CHECK.
      if r.qual is not null then
        v_sql := v_sql || format(' using (%s)', v_qual);
      end if;
      v_sql := v_sql || format(' with check (%s)', v_check);
    else
      v_sql := v_sql || format(' using (%s)', v_qual);
    end if;

    execute v_sql;
    v_count := v_count + 1;
    raise notice 'actualizada: %.%', r.relname, r.polname;
  end loop;

  raise notice '── policies actualizadas: % (esperadas: %)', v_count, v_esperado;

  -- Guard rail: si el conteo no cuadra, algo cambió en el esquema desde que se
  -- escribió esta migración. Abortar antes que dejar permisos a medias.
  -- (v_count = 0 se acepta: significa que la migración ya se había aplicado.)
  if v_count <> v_esperado and v_count <> 0 then
    raise exception 'Se esperaban % policies, se actualizaron %. Abortando por seguridad.',
      v_esperado, v_count;
  end if;
end
$mig$;


-- ═══════════════════════════════════════════════════════════════════════
-- §2 · GRUPO C — usuarios: auto-lectura de la propia fila
-- ═══════════════════════════════════════════════════════════════════════
-- POR QUÉ: la policy `gym_isolation` de `usuarios` usa el mismo allowlist, así que
-- recepción no podría leer NI SU PROPIA FILA. El panel relee `usuarios` con `.single()`
-- al restaurar sesión (VELUM_Sistema_Interno.html:25650) para comparar `pw_version`;
-- si devuelve null ejecuta clearSession() → el usuario recepción quedaría DESLOGUEADO
-- en cada refresh (F5). Este es un blocker funcional, no un nice-to-have.
--
-- ALCANCE DELIBERADAMENTE MÍNIMO:
--   · SELECT únicamente (sin insert/update/delete)
--   · SOLO la propia fila → jamás ve a otros usuarios
--   · exige app_rol no vacío + gym_id coincidente, para que los JWT del portal de
--     atletas (que no llevan app_rol; auth_app_rol() devuelve '') no puedan usarla
--
-- MATCH POR `sub` (= usuarios.id), NO por email. move-login firma sub=String(user.id),
-- así que hay identificador exacto disponible. Emparejar por email fallaba en 3 casos:
--   · dos filas con el mismo email en el gym → devolvía AMBAS (fuga entre usuarios)
--   · si un admin corrige el email de alguien, su JWT vigente deja de empatar
--     → deslogueo en cada F5, justo el bug que esta policy viene a resolver
--   · diferencias de mayúsculas entre el claim y la columna
drop policy if exists usuarios_self_select on public.usuarios;

create policy usuarios_self_select on public.usuarios
  for select
  to authenticated
  using (
    id::text   = (select auth.jwt() ->> 'sub')
    and gym_id = (select auth_gym_id())
    and coalesce((select auth_app_rol()), '') <> ''
  );


-- ═══════════════════════════════════════════════════════════════════════
-- §3 · usuarios: quitar columnas secretas del alcance de `authenticated`
-- ═══════════════════════════════════════════════════════════════════════
-- RLS filtra FILAS, no COLUMNAS. Sin esto, cualquier fila visible vía PostgREST
-- expone pw_hash, totp_secret y recovery_codes:
--   · un `recepcion`/`coach` leería los suyos → poder leer tu propio totp_secret
--     vuelve el 2FA cosmético (quien robe la sesión genera códigos para siempre)
--   · un `admin` ya los leía de TODO su equipo vía gym_isolation — el panel hacía
--     literalmente select('*') sobre usuarios (corregido en el mismo commit)
--
-- Las edge functions NO se ven afectadas: usan SUPABASE_SERVICE_ROLE_KEY, que
-- conserva sus propios grants (move-login sigue leyendo pw_hash para verificar).
-- OJO con la lista: loadSecurityState() del panel pide totp_enabled Y totp_enrolled_at
-- con el JWT del usuario (rol authenticated). Omitir totp_enrolled_at rompe la sección
-- de 2FA con un 403 para TODOS los roles, no solo recepción.
-- Lo que SÍ queda fuera a propósito: pw_hash, password, totp_secret, recovery_codes.
revoke select on public.usuarios from authenticated;

grant select (id, created_at, nombre, email, rol, activo, gym_id, pw_version,
              totp_enabled, totp_enrolled_at)
  on public.usuarios to authenticated;


-- ═══════════════════════════════════════════════════════════════════════
-- §3 · VERIFICACIÓN (correr después de aplicar)
-- ═══════════════════════════════════════════════════════════════════════
-- Debe devolver 30 filas, todas con recepcion=true:
--
-- select c.relname, p.polname,
--        pg_get_expr(p.polqual,p.polrelid) like '%recepcion%'
--     or pg_get_expr(p.polwithcheck,p.polrelid) like '%recepcion%' as recepcion
-- from pg_policy p
-- join pg_class c on c.oid=p.polrelid
-- join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
-- where c.relname = any (array['clientes','pagos','leads','member_subscriptions',
--       'reservas','waitlist','citas','medidas','bitacora_atleta','gym_config',
--       'protocolos','recursos'])
-- order by 1,2;
--
-- Y estas DEBEN seguir SIN 'recepcion' (el dinero):
-- select c.relname, p.polname from pg_policy p
-- join pg_class c on c.oid=p.polrelid
-- where c.relname in ('gastos','commission_payouts','storefront_orders')
--   and pg_get_expr(p.polqual,p.polrelid) like '%recepcion%';
-- → 0 filas
