-- PR77: optional supplement product details for the canonical Routine record.
alter table public.current_regimen_items
  add column if not exists brand text,
  add column if not exists reorder_url text,
  add column if not exists image_url text,
  add column if not exists product_source text,
  add column if not exists product_sku text;

alter table public.current_regimen_items
  drop constraint if exists current_regimen_items_product_details_kind_check;

alter table public.current_regimen_items
  add constraint current_regimen_items_product_details_kind_check
  check (
    (item_kind in ('supplement', 'endocrine_active_supplement'))
    or (brand is null and reorder_url is null and image_url is null and product_source is null and product_sku is null)
  );

alter table public.current_regimen_items
  drop constraint if exists current_regimen_items_reorder_url_check;

alter table public.current_regimen_items
  add constraint current_regimen_items_reorder_url_check
  check (reorder_url is null or (char_length(reorder_url) <= 2048 and reorder_url ~ '^https://'));

alter table public.current_regimen_items
  drop constraint if exists current_regimen_items_image_url_check;

alter table public.current_regimen_items
  add constraint current_regimen_items_image_url_check
  check (
    image_url is null
    or (
      char_length(image_url) <= 2048
      and image_url ~ '^https://assets[.]fullscript[.]io/'
    )
  );

alter table public.current_regimen_items
  drop constraint if exists current_regimen_items_product_source_check;

alter table public.current_regimen_items
  add constraint current_regimen_items_product_source_check
  check (product_source is null or product_source in ('fullscript', 'fallback', 'member'));

comment on column public.current_regimen_items.brand is
  'Optional member-recorded brand for supplement organization. Not an endorsement.';
comment on column public.current_regimen_items.reorder_url is
  'Optional HTTPS destination recorded for a supplement. May be a member-entered or affiliate link.';
comment on column public.current_regimen_items.image_url is
  'Optional trusted Fullscript catalog image. Images are never required for a Routine item.';
comment on column public.current_regimen_items.product_source is
  'Origin of optional supplement product metadata: Fullscript, fallback catalog, or member.';

-- Existing owner RLS and server-controlled write grants on current_regimen_items
-- automatically cover these additive columns.

-- Rollback notes:
-- Drop the four PR77 constraints first, then drop brand, reorder_url, image_url,
-- product_source, and product_sku from public.current_regimen_items.
