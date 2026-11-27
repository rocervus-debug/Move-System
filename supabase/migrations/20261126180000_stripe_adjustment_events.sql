-- Signed webhook snapshots. amount_cents on charge.refunded is cumulative per charge.
create table public.stripe_adjustment_events (
  livemode boolean not null,
  stripe_account text not null,
  event_id text not null,
  event_type text not null,
  occurred_at timestamptz not null,
  object_id text not null,
  charge_id text,
  payment_intent_id text,
  currency text not null,
  amount_cents bigint not null check (amount_cents >= 0),
  status text,
  primary key (livemode, stripe_account, event_id)
);
alter table public.stripe_adjustment_events enable row level security;
revoke all on public.stripe_adjustment_events from public, anon, authenticated;
grant select, insert on public.stripe_adjustment_events to service_role;
