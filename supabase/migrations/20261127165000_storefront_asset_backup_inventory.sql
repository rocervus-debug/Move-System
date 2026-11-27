create schema velum_backup_private;
revoke all on schema velum_backup_private from public, anon, authenticated, service_role;

create table velum_backup_private.storage_reader (
  singleton boolean primary key default true check (singleton),
  token_sha256 bytea not null check (octet_length(token_sha256) = 32)
);
alter table velum_backup_private.storage_reader enable row level security;
revoke all on velum_backup_private.storage_reader from public, anon, authenticated, service_role;

create function public.storefront_asset_backup_inventory()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  token text := current_setting('request.headers', true)::jsonb ->> 'x-velum-inventory';
begin
  if length(token) is distinct from 64 or not exists (
    select 1 from velum_backup_private.storage_reader
    where token_sha256 = pg_catalog.sha256(pg_catalog.convert_to(token, 'UTF8'))
  ) then
    raise insufficient_privilege using message = 'Acceso denegado';
  end if;
  if not exists (select 1 from storage.buckets where id = 'storefront-assets' and public) then
    raise exception 'El depósito público de la tienda no está disponible';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', name, 'version', version, 'size', (metadata->>'size')::bigint,
      'etag', metadata->>'eTag', 'content_type', metadata->>'mimetype',
      'cache_control', metadata->>'cacheControl'
    ) order by name), '[]'::jsonb)
    from storage.objects where bucket_id = 'storefront-assets'
  );
end
$$;
revoke all on function public.storefront_asset_backup_inventory() from public, authenticated, anon, service_role;
grant execute on function public.storefront_asset_backup_inventory() to anon;
