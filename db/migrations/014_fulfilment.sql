-- Fulfilment: courier and tracking, two more order stages, COD balance collection, refunds and internal notes.
-- Additive: existing orders keep their status and payment state.

alter table orders add column carrier text;
alter table orders add column tracking_number text;
alter table orders add column dispatched_at timestamptz;

-- Cash collected on delivery (the part not paid as an advance), recorded by staff.
alter table orders add column balance_collected int not null default 0 check (balance_collected >= 0);
alter table orders add column balance_collected_at timestamptz;
alter table orders add column balance_collected_by text;

-- Money given back to the customer, in whole rupees. Never more than was received (enforced in code).
alter table orders add column refunded_amount int not null default 0 check (refunded_amount >= 0);

-- Two extra stages between "being prepared" and "delivered".
alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check check (status in
  ('pending_confirmation','confirmed','processing','packed','shipped','out_for_delivery','delivered','cancelled','rejected','failed_delivery','return_requested','returned'));

alter table orders drop constraint if exists orders_payment_status_check;
alter table orders add constraint orders_payment_status_check check (payment_status in ('unpaid','pending','partial','paid','refunded','partially_refunded','failed'));

-- Staff-only notes on an order. Never shown to customers.
create table order_notes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  author text not null,
  body text not null check (length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index order_notes_order_idx on order_notes(order_id, created_at);
alter table order_notes enable row level security;
