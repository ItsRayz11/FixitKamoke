-- Discount upgrades. Additive: every existing product and coupon behaves exactly as before.

-- A sale price can have a start and an end. Empty means "always on" (the old behaviour).
alter table products add column sale_starts_at timestamptz;
alter table products add column sale_ends_at timestamptz;
alter table products add constraint products_sale_window_check check (sale_starts_at is null or sale_ends_at is null or sale_ends_at > sale_starts_at);

-- Coupons: start date, per-customer limit, "not together with sale prices", one category, and a free-delivery type.
alter table coupons add column starts_at timestamptz;
alter table coupons add column per_customer_limit int check (per_customer_limit is null or per_customer_limit > 0);
alter table coupons add column allow_with_sale boolean not null default true;
alter table coupons add column category_id uuid references categories(id) on delete set null;
alter table coupons drop constraint if exists coupons_type_check;
alter table coupons add constraint coupons_type_check check (type in ('percent','fixed','freeship'));
