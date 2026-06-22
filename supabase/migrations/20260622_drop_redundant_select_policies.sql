-- 20260622 — Eliminar 2 políticas SELECT permisivas REDUNDANTES (advisor 0006).
-- En ambos casos la política eliminada es un SUBCONJUNTO ESTRICTO de otra del mismo
-- rol sobre la misma tabla: el acceso efectivo queda IDÉNTICO, solo se evita evaluar
-- dos políticas por query.
--
-- 1) commission_payouts.commissions_read  (admin, superadmin)
--    ⊂ payouts_admin_read                  (admin, STAFF, superadmin)   -> se conserva payouts_admin_read
-- 2) error_logs.error_logs_select_sa  (role public, qual = is_superadmin())
--    ⊂ error_logs_select_gym          (authenticated, is_superadmin() OR auth_gym_id = gym_id)
--    Para anon, is_superadmin() = false -> select_sa no otorgaba nada.   -> se conserva select_gym
--
-- NO se tocan los 6 pares restantes (clientes, gym_config, gym_storefront, packages,
-- protocolos, recursos, storefront_listings): son combinaciones intencionales de
-- "lectura pública anon" + "gestión admin" y deben permanecer separadas.
drop policy if exists commissions_read    on public.commission_payouts;
drop policy if exists error_logs_select_sa on public.error_logs;
