-- Online payments (gateway) and 360-degree turntable frames.

-- 1. A third way to pay. The gateway used is recorded in orders.payment_provider.
alter table orders drop constraint if exists orders_payment_method_check;
alter table orders add constraint orders_payment_method_check check (payment_method in ('cod','bank_transfer','online'));

-- 2. One row per attempt to pay an order online. `reference` is the merchant reference we send to the gateway and
--    the gateway sends back; it is the only thing a verified notification is matched on.
create table payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  provider text not null check (provider in ('safepay','jazzcash','easypaisa')),
  reference text not null unique,
  amount int not null check (amount > 0), -- whole rupees, the order total at the moment of the attempt
  status text not null default 'created' check (status in ('created','paid','failed')),
  provider_ref text,
  last_error text,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index payment_attempts_order_idx on payment_attempts(order_id);

-- 3. A log of every notification the gateways send us, verified or not, with the reason it was accepted or refused.
--    It holds no card data and no customer details. It is how an owner proves a gateway works before switching it on.
create table payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  received_at timestamptz not null default now(),
  verified boolean not null,
  outcome text not null,
  reason text,
  reference text
);
create index payment_events_provider_idx on payment_events(provider, received_at desc);

-- 4. Turntable frames live beside the normal photos and are told apart by kind.
alter table product_images add column kind text not null default 'photo' check (kind in ('photo','spin'));

alter table payment_attempts enable row level security;
alter table payment_events enable row level security;
