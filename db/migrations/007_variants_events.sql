-- V2: finishes/variants and richer funnel events.
-- A finish (colour) is its own product row, so stock, SKU, price, photos and orders all work per finish without
-- touching the cart or order code. Products that share variant_group are shown as one product with finish choices.
alter table products add column variant_group text;
alter table products add column variant_label text;
alter table products add column variant_hex text check (variant_hex is null or variant_hex ~ '^#[0-9a-fA-F]{6}$');
-- When true, the customer must pick a finish themselves before "Add to cart" works (no silent default).
alter table products add column variant_required boolean not null default false;
alter table products add constraint products_variant_label_chk check (variant_group is null or variant_label is not null);
create index products_variant_group_idx on products(variant_group) where variant_group is not null;

-- Funnel events (count-only, no personal data): listing views, listing->detail clicks, cart views, checkout form errors.
alter table analytics_events drop constraint analytics_events_name_check;
alter table analytics_events add constraint analytics_events_name_check check (name in
  ('product_view','add_to_cart','checkout_start','order_placed','repair_submitted','newsletter_signup',
   'listing_view','product_click','cart_view','checkout_error','repair_start'));

-- Coarse device class (from viewport width, not the user agent) so the funnel can be read for phones separately.
alter table analytics_events add column device text check (device is null or device in ('mobile','desktop'));
