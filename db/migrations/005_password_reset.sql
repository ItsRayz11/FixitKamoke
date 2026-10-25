-- Single-use, short-lived password reset tokens (only a hash is stored).
create table password_resets (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index password_resets_customer_idx on password_resets(customer_id);
