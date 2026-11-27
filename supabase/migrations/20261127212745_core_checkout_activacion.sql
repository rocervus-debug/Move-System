alter table public.member_subscriptions add column if not exists stripe_checkout_session_id text;
create unique index if not exists member_subscriptions_checkout_session_key
  on public.member_subscriptions (stripe_checkout_session_id) where stripe_checkout_session_id is not null;
