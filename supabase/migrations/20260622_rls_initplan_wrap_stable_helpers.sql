-- 20260622 — Optimización RLS (initplan): envolver helpers STABLE en (SELECT ...)
-- para que se evalúen UNA vez por query en vez de por fila.
--
-- Semánticamente IDÉNTICO: is_superadmin/auth_gym_id/auth_app_rol/auth_cliente_id/
-- auth_qr_token son STABLE → devuelven el mismo valor para todas las filas de una
-- consulta, así que envolverlos en un subselect escalar no cambia el resultado, solo
-- evita la reevaluación por fila. Mismo patrón que ya tenían citas/reservas/waitlist
-- (excluidas aquí). 63 políticas en 36 tablas. Aislamiento multi-tenant verificado
-- por round-trip tras aplicar (lectura y escritura cross-tenant siguen bloqueadas).
do $$
declare
  r record;
  nq text;
  nc text;
  stmt text;
  n int := 0;
begin
  for r in
    select tablename, policyname, coalesce(qual,'') as qual, coalesce(with_check,'') as with_check
    from pg_policies
    where schemaname='public'
      and tablename not in ('citas','reservas','waitlist')
      and (
        (qual is not null and qual ~ 'auth_gym_id\(\)|auth_app_rol\(\)|auth_cliente_id\(\)|is_superadmin\(\)|auth_qr_token\(\)|auth\.uid\(\)|auth\.jwt\(\)')
        or (with_check is not null and with_check ~ 'auth_gym_id\(\)|auth_app_rol\(\)|auth_cliente_id\(\)|is_superadmin\(\)|auth_qr_token\(\)|auth\.uid\(\)|auth\.jwt\(\)')
      )
  loop
    nq := regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
      r.qual,
      'is_superadmin\(\)','(SELECT is_superadmin())','g'),
      'auth_gym_id\(\)','(SELECT auth_gym_id())','g'),
      'auth_app_rol\(\)','(SELECT auth_app_rol())','g'),
      'auth_cliente_id\(\)','(SELECT auth_cliente_id())','g'),
      'auth_qr_token\(\)','(SELECT auth_qr_token())','g'),
      'auth\.uid\(\)','(SELECT auth.uid())','g'),
      'auth\.jwt\(\)','(SELECT auth.jwt())','g');
    nc := regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
      r.with_check,
      'is_superadmin\(\)','(SELECT is_superadmin())','g'),
      'auth_gym_id\(\)','(SELECT auth_gym_id())','g'),
      'auth_app_rol\(\)','(SELECT auth_app_rol())','g'),
      'auth_cliente_id\(\)','(SELECT auth_cliente_id())','g'),
      'auth_qr_token\(\)','(SELECT auth_qr_token())','g'),
      'auth\.uid\(\)','(SELECT auth.uid())','g'),
      'auth\.jwt\(\)','(SELECT auth.jwt())','g');
    stmt := 'ALTER POLICY '||quote_ident(r.policyname)||' ON public.'||quote_ident(r.tablename)
      || case when r.qual <> '' then ' USING ('||nq||')' else '' end
      || case when r.with_check <> '' then ' WITH CHECK ('||nc||')' else '' end;
    execute stmt;
    n := n + 1;
  end loop;
  raise notice 'Políticas optimizadas: %', n;
end $$;
