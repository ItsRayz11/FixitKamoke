-- "Tell me when it is back": a visitor asks for ONE email when a sold-out item (or finish) has stock again.
-- Transactional, not marketing: it is used only for that single message, and the row is purged 30 days after it is sent.
create table stock_alerts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  email text not null check (length(email) <= 200),
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  unique (product_id, email)
);
create index stock_alerts_waiting_idx on stock_alerts(product_id) where notified_at is null;

alter table stock_alerts enable row level security;
