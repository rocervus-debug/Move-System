alter table public.pagos
  alter column stripe_fee_mxn type numeric(14,2),
  alter column velum_commission_mxn type numeric(14,2),
  alter column net_to_gym_mxn type numeric(14,2),
  add column if not exists stripe_balance_transaction_id text;
