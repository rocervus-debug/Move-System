-- The journal stays private. Staff may read only a financial summary of their own gym's orders.
create schema if not exists velum_finance_private;
revoke all on schema velum_finance_private from public, anon;
grant usage on schema velum_finance_private to authenticated;

create index if not exists stripe_adjustments_payment_lookup
  on public.stripe_adjustment_events (payment_intent_id, stripe_account, livemode)
  where payment_intent_id is not null;

create function velum_finance_private.storefront_refunds(p_pago_ids bigint[])
returns table (pago_id bigint, refunded_cents bigint, needs_review boolean)
language sql stable security definer set search_path = '' as $$
  with orders as (
    select p.id, o.amount_cents, o.stripe_payment_intent_id,
           coalesce(o.raw_event->>'account', 'platform') as account,
           o.raw_event->'livemode' as live
      from public.pagos p
      join public.storefront_orders o
        on o.gym_id = p.gym_id and o.stripe_session_id = p.stripe_session_id
     where p.id = any(p_pago_ids)
       and p.gym_id = (select public.auth_gym_id())
       and (select public.auth_app_rol()) in ('admin','staff','recepcion','superadmin')
       and lower(o.currency) = 'mxn'
  ), snapshots as (
    select distinct on (o.id, e.object_id)
           o.id, o.amount_cents as original_cents, e.event_type, e.status, e.amount_cents
      from orders o join public.stripe_adjustment_events e
        on e.payment_intent_id = o.stripe_payment_intent_id
       and e.stripe_account = o.account and to_jsonb(e.livemode) = o.live
     where e.currency = 'mxn'
       and e.event_type in ('charge.refunded','refund.created','refund.updated','refund.failed','charge.refund.updated')
     order by o.id, e.object_id, e.occurred_at desc,
       case when e.status in ('failed','canceled') then 2 when e.status = 'succeeded' then 1 else 0 end desc,
       e.amount_cents desc, e.event_id desc
  ), amounts as (
    select id, original_cents,
           coalesce(sum(amount_cents) filter (where event_type = 'charge.refunded'),0) as cumulative,
           coalesce(sum(amount_cents) filter (where event_type <> 'charge.refunded' and status = 'succeeded'),0) as succeeded,
           bool_or(event_type <> 'charge.refunded' and coalesce(status,'') not in ('succeeded','failed','canceled')) as pending,
           bool_or(event_type <> 'charge.refunded' and status in ('failed','canceled')) as failed
      from snapshots group by id, original_cents
  )
  select id::bigint, greatest(cumulative, succeeded)::bigint,
         pending or (failed and cumulative <> succeeded) or greatest(cumulative, succeeded) > original_cents
    from amounts
$$;
revoke all on function velum_finance_private.storefront_refunds(bigint[]) from public, anon;
grant execute on function velum_finance_private.storefront_refunds(bigint[]) to authenticated;

create function public.storefront_refunds_for_payments(p_pago_ids bigint[])
returns table (pago_id bigint, refunded_cents bigint, needs_review boolean)
language sql stable security invoker set search_path = '' as $$
  select * from velum_finance_private.storefront_refunds(p_pago_ids)
$$;
revoke all on function public.storefront_refunds_for_payments(bigint[]) from public, anon;
grant execute on function public.storefront_refunds_for_payments(bigint[]) to authenticated;
