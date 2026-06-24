-- 20260623 — Ampliar el CHECK source_valid de pagos.
-- El webhook de Stripe (stripe-webhook v12) registra pagos con source='domiciliacion'
-- (cobros domiciliados: primer cargo y renovaciones) y source='manual_link' (links de pago).
-- El CHECK no los incluía -> esos inserts fallaban silenciosamente y el cobro nunca se
-- registraba en VELUM (ni extendía la membresía, ni aparecía en la sección Domiciliados).
-- Aditivo: solo amplía los valores permitidos; los pagos existentes ('admin') siguen válidos.
alter table public.pagos drop constraint source_valid;
alter table public.pagos add constraint source_valid
  check (source = any (array['admin'::text, 'storefront'::text, 'app'::text, 'recovery'::text, 'qr'::text, 'auto_renewal'::text, 'domiciliacion'::text, 'manual_link'::text]));
