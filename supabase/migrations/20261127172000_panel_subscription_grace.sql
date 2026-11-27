-- El periodo siguiente de Stripe puede avanzar aunque la factura siga impaga.
alter table public.gyms add column subscription_grace_until timestamptz;

create function public.set_panel_subscription_grace()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.subscription_status is distinct from 'past_due' then
    new.subscription_grace_until := null;
  elsif tg_op = 'INSERT' then
    new.subscription_grace_until := now() + interval '72 hours';
  elsif old.subscription_status is distinct from 'past_due' then
    new.subscription_grace_until := now() + interval '72 hours';
  else
    new.subscription_grace_until := old.subscription_grace_until;
  end if;
  return new;
end;
$$;

-- Para registros anteriores sólo se conserva una fecha de vencimiento conocida.
update public.gyms
set subscription_grace_until = subscription_current_period_end + interval '72 hours'
where subscription_status = 'past_due' and subscription_current_period_end <= now();

create trigger set_panel_subscription_grace
before insert or update of subscription_status, subscription_grace_until on public.gyms
for each row execute function public.set_panel_subscription_grace();
