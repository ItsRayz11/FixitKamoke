-- Customer accounts, reviews, wishlist, repair history, analytics events, payment status, blog extras.

create table customers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  name text not null,
  phone text,
  deletion_requested_at timestamptz,
  created_at timestamptz not null default now()
);

create table customer_sessions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  label text not null default 'Home',
  recipient_name text not null,
  phone text not null,
  city text not null,
  area text,
  address text not null,
  is_default boolean not null default false
);
create index customer_addresses_customer_idx on customer_addresses(customer_id);

create table wishlist_items (
  customer_id uuid not null references customers(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (customer_id, product_id)
);

alter table orders add column customer_id uuid references customers(id) on delete set null;
alter table orders add column payment_status text not null default 'unpaid' check (payment_status in ('unpaid','pending','paid','refunded','failed'));
alter table orders add column payment_provider text;
alter table orders add column payment_reference text;
create index orders_customer_idx on orders(customer_id);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  author_name text not null,
  rating int not null check (rating between 1 and 5),
  body text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);
create index reviews_product_idx on reviews(product_id, status);

create table repair_status_history (
  id uuid primary key default gen_random_uuid(),
  repair_id uuid not null references repair_inquiries(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor text not null,
  note text,
  created_at timestamptz not null default now()
);

-- Privacy-minimal funnel events: no IP, no user agent, no personal data.
create table analytics_events (
  id bigint generated always as identity primary key,
  name text not null check (name in ('product_view','add_to_cart','checkout_start','order_placed','repair_submitted','newsletter_signup')),
  path text,
  session_id text,
  created_at timestamptz not null default now()
);
create index analytics_events_name_idx on analytics_events(name, created_at);

alter table marketing_consent add column unsubscribe_token text not null default replace(gen_random_uuid()::text, '-', '');
create unique index marketing_consent_unsub_idx on marketing_consent(unsubscribe_token);

alter table blog_posts add column cover_url text;
alter table blog_posts add column meta_description text;
alter table blog_posts add column product_slugs text[] not null default '{}';
alter table blog_posts add column needs_review boolean not null default false;

alter table admin_users add column display_name text;
