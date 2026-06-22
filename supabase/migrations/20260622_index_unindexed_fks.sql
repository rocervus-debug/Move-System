-- 20260622 — Índices de cobertura para foreign keys sin indexar (advisor 0001).
-- Sin un índice en la columna FK, los JOINs y los borrados/updates del padre hacen
-- seq scan del hijo. Todos additivos e idempotentes (IF NOT EXISTS); tablas pequeñas.
create index if not exists idx_ia_conv_cart_id              on public.ia_conversations_public (cart_id);
create index if not exists idx_ia_conv_listing_recommended  on public.ia_conversations_public (listing_recommended);
create index if not exists idx_member_subs_package_id       on public.member_subscriptions (package_id);
create index if not exists idx_sf_carts_listing_id          on public.storefront_carts (listing_id);
create index if not exists idx_sf_carts_package_id          on public.storefront_carts (package_id);
create index if not exists idx_sf_leads_ia_conversation_id  on public.storefront_leads (ia_conversation_id);
create index if not exists idx_sf_leads_package_id          on public.storefront_leads (package_id);
create index if not exists idx_sf_listings_package_id       on public.storefront_listings (package_id);
create index if not exists idx_sf_orders_cliente_id         on public.storefront_orders (cliente_id);
create index if not exists idx_sf_orders_package_id         on public.storefront_orders (package_id);
