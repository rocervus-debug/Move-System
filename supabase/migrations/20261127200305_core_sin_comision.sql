-- VELUM cobra una suscripción fija. Los importes liquidados conservan su historial.
ALTER TABLE public.gym_storefront ALTER COLUMN commission_pct SET DEFAULT 0;
UPDATE public.gym_storefront SET commission_pct = 0 WHERE commission_pct IS DISTINCT FROM 0;
ALTER TABLE public.gym_storefront ADD CONSTRAINT gym_storefront_zero_commission CHECK (commission_pct = 0);

CREATE OR REPLACE FUNCTION public.calc_velum_commission(p_gym_id bigint, p_gross_amount integer)
RETURNS integer
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$ SELECT 0 $$;
COMMENT ON COLUMN public.gym_storefront.commission_pct IS 'Porcentaje por venta de VELUM. El plan mensual incluye los cobros con comisión VELUM de 0%.';
