-- Owner-written return and warranty policies. Several of each can exist; each product picks one (or uses the default).
-- Additive: products keep working exactly as before until a policy is created and chosen.
create table product_policies (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('return', 'warranty')),
  name text not null check (char_length(name) between 2 and 80),
  summary text check (summary is null or char_length(summary) <= 200),
  body text not null check (char_length(body) between 1 and 6000),
  is_default boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index product_policies_name_uniq on product_policies (kind, lower(name));
-- At most one default per kind.
create unique index product_policies_one_default on product_policies (kind) where is_default;

alter table products add column return_policy_id uuid references product_policies(id) on delete set null;
alter table products add column warranty_policy_id uuid references product_policies(id) on delete set null;

alter table product_policies enable row level security;
