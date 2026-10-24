-- Fixit initial schema. All money columns are whole PKR (integer).
create table categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  brand text,
  category_id uuid references categories(id) on delete restrict,
  description text not null default '',
  price int not null check (price >= 0),
  sale_price int check (sale_price is null or (sale_price >= 0 and sale_price < price)),
  sku text unique,
  stock int not null default 0 check (stock >= 0),
  published boolean not null default false,
  specs jsonb not null default '{}'::jsonb,
  compatible_devices text[] not null default '{}',
  warranty_info text,
  weight_grams int check (weight_grams is null or weight_grams >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_category_idx on products(category_id) where published;

create table product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  url text not null,
  alt text not null default '',
  sort_order int not null default 0
);
create index product_images_product_idx on product_images(product_id);

create table coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  type text not null check (type in ('percent','fixed')),
  value int not null check (value > 0),
  min_subtotal int not null default 0,
  max_discount int,
  active boolean not null default true,
  expires_at timestamptz,
  usage_limit int,
  used_count int not null default 0
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  idempotency_key text not null unique,
  tracking_token_hash text not null unique,
  status text not null default 'pending_confirmation' check (status in
    ('pending_confirmation','confirmed','processing','shipped','delivered','cancelled','rejected','failed_delivery','return_requested','returned')),
  customer_name text not null,
  phone text not null,
  email text,
  city text not null,
  area text,
  address text not null,
  notes text,
  payment_method text not null check (payment_method in ('cod','bank_transfer')),
  coupon_code text,
  subtotal int not null check (subtotal >= 0),
  discount int not null default 0 check (discount >= 0),
  shipping_fee int not null check (shipping_fee >= 0),
  total int not null check (total >= 0),
  shipping_status text not null check (shipping_status in ('quoted','needs_confirmation')),
  shipping_policy_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_status_idx on orders(status, created_at desc);
create index orders_phone_idx on orders(phone);

-- Immutable snapshot of what was bought, at the price paid.
create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_name text not null,
  sku text,
  unit_price int not null check (unit_price >= 0),
  quantity int not null check (quantity > 0),
  line_total int not null check (line_total >= 0)
);
create index order_items_order_idx on order_items(order_id);

create table order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor text not null,
  note text,
  created_at timestamptz not null default now()
);

create table repair_inquiries (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  tracking_token_hash text not null unique,
  status text not null default 'new' check (status in ('new','reviewing','estimate_sent','awaiting_customer','booked','in_repair','ready','completed','declined','cancelled')),
  customer_name text not null,
  phone text not null,
  email text,
  device_brand text not null,
  device_model text not null,
  issue text not null,
  preferred_contact text not null default 'whatsapp',
  appointment_preference text,
  estimate_amount int check (estimate_amount is null or estimate_amount >= 0),
  estimate_is_confirmed boolean not null default false,
  staff_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text not null default '',
  body_md text not null default '',
  author text,
  status text not null default 'draft' check (status in ('draft','published')),
  published_at timestamptz,
  updated_at timestamptz not null default now()
);

create table admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  role text not null check (role in ('owner','manager','staff')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table admin_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references admin_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  action text not null,
  entity text not null,
  entity_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table marketing_consent (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  consented_at timestamptz not null default now(),
  source text not null,
  unsubscribed_at timestamptz
);

create table notification_outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  recipient text not null,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text not null unique,
  status text not null default 'pending' check (status in ('pending','sent','failed','skipped_unconfigured')),
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table store_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
