-- Finance, costing and accounting. ADDITIVE ONLY: new tables and nullable/defaulted columns; no existing data is changed
-- except (a) opening stock rows are written to the new stock ledger and (b) delivered_at is back-filled from status history.
-- Money is whole rupees (int). Unit costs are numeric(14,2/4) because an average cost is fractional. NULL cost = unknown (never invented).
-- See docs/FINANCE_PLAN.md.

-- ---------- existing tables: new columns ----------
alter table products add column avg_cost numeric(14,4) check (avg_cost is null or avg_cost >= 0);
-- Units on hand whose purchase cost is unknown (everything in stock when finance went live). They are used up first and
-- reported as "cost unknown"; the owner can declare an opening cost for them (audited), nothing is invented.
alter table products add column unvalued_units int not null default 0 check (unvalued_units >= 0);
update products set unvalued_units = stock;
alter table order_items add column unit_cost numeric(14,4) check (unit_cost is null or unit_cost >= 0);
alter table order_items add column returned_qty int not null default 0 check (returned_qty >= 0);
alter table order_items add column cost_unknown_qty int; -- null = placed before costing existed: whole line cost unknown
alter table orders add column delivered_at timestamptz;
alter table repair_inquiries add column final_charge int check (final_charge is null or final_charge >= 0);
alter table repair_inquiries add column labor_cost int check (labor_cost is null or labor_cost >= 0);
alter table repair_inquiries add column completed_at timestamptz;
alter table admin_users add column finance_perms text[] not null default '{}';

update orders o set delivered_at = h.at
  from (select order_id, max(created_at) as at from order_status_history where to_status = 'delivered' group by order_id) h
  where h.order_id = o.id and o.delivered_at is null;

-- ---------- immutability helper ----------
create function fin_block_change() returns trigger language plpgsql as $$
begin
  raise exception 'Ledger rows are immutable: post a reversing entry instead (table %).', tg_table_name;
end $$;

-- ---------- suppliers and purchases ----------
create table suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  phone text, email text, address text, notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table purchases (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references suppliers(id) on delete restrict,
  invoice_no text,
  purchase_date date not null default current_date,
  status text not null default 'draft' check (status in ('draft','received','cancelled')),
  items_total int not null default 0 check (items_total >= 0),
  discount int not null default 0 check (discount >= 0),
  transport_cost int not null default 0 check (transport_cost >= 0),
  other_cost int not null default 0 check (other_cost >= 0),
  total_cost int not null default 0 check (total_cost >= 0),
  paid_amount int not null default 0 check (paid_amount >= 0),
  due_date date,
  note text,
  received_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now()
);
create index purchases_supplier_idx on purchases(supplier_id, purchase_date desc);

create table purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references purchases(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  pack_type text not null default 'unit' check (pack_type in ('unit','box')),
  qty_entered int not null check (qty_entered > 0),
  units_per_box int not null default 1 check (units_per_box > 0),
  units_received int not null check (units_received > 0),
  cost_entered numeric(14,2) not null check (cost_entered >= 0), -- per unit or per box, as typed
  line_total int not null check (line_total >= 0),
  landed_unit_cost numeric(14,4) -- set when received: line cost + share of transport/other - share of discount, per unit
);
create index purchase_items_purchase_idx on purchase_items(purchase_id);

-- ---------- stock ledger ----------
create table stock_movements (
  id bigint generated always as identity primary key,
  product_id uuid not null references products(id) on delete restrict,
  kind text not null check (kind in ('opening','purchase','sale','sale_cancel','return','repair_use','pos_sale','adjustment','purchase_return')),
  qty_delta int not null check (qty_delta <> 0),
  unit_cost numeric(14,4),
  ref_type text, ref_id text,
  idem_key text not null unique,
  note text, actor text,
  created_at timestamptz not null default now()
);
create index stock_movements_product_idx on stock_movements(product_id, created_at desc);
create trigger stock_movements_immutable before update or delete or truncate on stock_movements for each statement execute function fin_block_change();

insert into stock_movements(product_id, kind, qty_delta, unit_cost, ref_type, idem_key, note, actor)
  select id, 'opening', stock, null, 'migration', 'opening:' || id, 'Opening balance at finance go-live; cost unknown', 'system'
  from products where stock > 0;

-- ---------- chart of accounts + double-entry ledger ----------
create table fin_accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  type text not null check (type in ('asset','liability','equity','income','expense')),
  kind text not null check (kind in ('cash','bank','wallet','system','expense_cat')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into fin_accounts(code, name, type, kind) values
  ('1000','Cash in hand','asset','cash'),
  ('1010','Bank account','asset','bank'),
  ('1020','JazzCash','asset','wallet'),
  ('1030','Easypaisa','asset','wallet'),
  ('1100','Receivables (customers)','asset','system'),
  ('1200','Inventory','asset','system'),
  ('2000','Payables (suppliers)','liability','system'),
  ('2100','Customer advances','liability','system'),
  ('3000','Owner equity / opening balances','equity','system'),
  ('4000','Sales','income','system'),
  ('4010','Delivery charges collected','income','system'),
  ('4020','Repair income','income','system'),
  ('4090','Sales discounts','income','system'),
  ('4100','Service fees and commissions','income','system'),
  ('4200','Refunds and returns','income','system'),
  ('5000','Cost of goods sold','expense','system'),
  ('5100','Inventory adjustments and write-offs','expense','system'),
  ('5200','Cash and balance differences','expense','system'),
  ('6010','Rent','expense','expense_cat'),
  ('6020','Electricity','expense','expense_cat'),
  ('6030','Internet','expense','expense_cat'),
  ('6040','Salaries','expense','expense_cat'),
  ('6050','Repairs and maintenance','expense','expense_cat'),
  ('6060','Supplies','expense','expense_cat'),
  ('6070','Delivery and courier','expense','expense_cat'),
  ('6080','Fees and charges','expense','expense_cat'),
  ('6090','Miscellaneous','expense','expense_cat');

create table fin_journals (
  id uuid primary key default gen_random_uuid(),
  idem_key text not null unique,
  effective_date date not null,
  memo text not null,
  ref_type text, ref_id text,
  reverses_id uuid references fin_journals(id),
  actor text,
  created_at timestamptz not null default now()
);
create unique index fin_journals_one_reversal on fin_journals(reverses_id) where reverses_id is not null;

create table fin_entries (
  id bigint generated always as identity primary key,
  journal_id uuid not null references fin_journals(id),
  account_id uuid not null references fin_accounts(id),
  debit int not null default 0 check (debit >= 0),
  credit int not null default 0 check (credit >= 0),
  party_type text, party_id text,
  check ((debit = 0) <> (credit = 0))
);
create index fin_entries_account_idx on fin_entries(account_id, journal_id);
create index fin_entries_journal_idx on fin_entries(journal_id);

create trigger fin_journals_immutable before update or delete or truncate on fin_journals for each statement execute function fin_block_change();
create trigger fin_entries_immutable before update or delete or truncate on fin_entries for each statement execute function fin_block_change();

-- Every journal must balance when its transaction commits.
create function fin_check_balanced() returns trigger language plpgsql as $$
declare d bigint; c bigint;
begin
  select coalesce(sum(debit),0), coalesce(sum(credit),0) into d, c from fin_entries where journal_id = new.journal_id;
  if d <> c then raise exception 'Unbalanced journal %: debits % credits %', new.journal_id, d, c; end if;
  return null;
end $$;
create constraint trigger fin_entries_balanced after insert on fin_entries deferrable initially deferred for each row execute function fin_check_balanced();

-- ---------- expenses ----------
create table expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  account_id uuid not null references fin_accounts(id),      -- an expense account (6xxx)
  pay_account_id uuid not null references fin_accounts(id),  -- the money account it was paid from
  amount int not null check (amount > 0),
  description text not null default '',
  receipt_url text,
  order_id uuid references orders(id) on delete set null,
  repair_id uuid references repair_inquiries(id) on delete set null,
  template_id uuid,
  period text, -- 'YYYY-MM' for recurring postings
  journal_id uuid references fin_journals(id),
  voided_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now()
);
create index expenses_date_idx on expenses(expense_date desc);

create table expense_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  account_id uuid not null references fin_accounts(id),
  pay_account_id uuid not null references fin_accounts(id),
  amount int not null check (amount > 0),
  day_of_month int not null default 1 check (day_of_month between 1 and 28),
  description text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table expenses add constraint expenses_template_fk foreign key (template_id) references expense_templates(id);
create unique index expenses_template_period_uq on expenses(template_id, period) where template_id is not null and voided_at is null;

-- ---------- wallet / recharge / miscellaneous services ----------
create table service_entries (
  id uuid primary key default gen_random_uuid(),
  occurred_on date not null default current_date,
  kind text not null check (kind in ('wallet_deposit','wallet_withdrawal','recharge','misc_income','other_commission')),
  principal int not null default 0 check (principal >= 0),
  fee_mode text not null default 'fixed' check (fee_mode in ('fixed','percent')),
  fee_value numeric(10,2) not null default 0 check (fee_value >= 0),
  fee_amount int not null default 0 check (fee_amount >= 0),
  cash_account_id uuid references fin_accounts(id),   -- where the customer pays / is paid
  wallet_account_id uuid references fin_accounts(id), -- the wallet or load balance the principal moves through
  fee_account_id uuid references fin_accounts(id),    -- where the fee lands
  customer_name text, customer_phone text, note text,
  journal_id uuid references fin_journals(id),
  voided_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now()
);

-- ---------- walk-in counter sales ----------
create table pos_sales (
  id uuid primary key default gen_random_uuid(),
  receipt_no text not null unique,
  idem_key text not null unique,
  sold_at timestamptz not null default now(),
  customer_name text, customer_phone text,
  subtotal int not null check (subtotal >= 0),
  discount int not null default 0 check (discount >= 0),
  total int not null check (total >= 0),
  paid_amount int not null default 0 check (paid_amount >= 0),
  pay_account_id uuid references fin_accounts(id),
  status text not null default 'completed' check (status in ('completed','voided')),
  journal_id uuid references fin_journals(id),
  created_by text not null
);
create table pos_sale_items (
  id uuid primary key default gen_random_uuid(),
  pos_sale_id uuid not null references pos_sales(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_name text not null,
  quantity int not null check (quantity > 0),
  unit_price int not null check (unit_price >= 0),
  line_total int not null check (line_total >= 0),
  unit_cost numeric(14,4),
  cost_unknown_qty int not null default 0
);

-- ---------- credit / udhaar ----------
create table credit_parties (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('customer','supplier')),
  name text not null,
  phone text,
  customer_id uuid references customers(id) on delete set null,
  supplier_id uuid references suppliers(id) on delete set null,
  credit_limit int check (credit_limit is null or credit_limit >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table credit_items (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references credit_parties(id) on delete restrict,
  direction text not null check (direction in ('receivable','payable')),
  source_type text not null, source_id text,
  amount int not null check (amount > 0),
  paid int not null default 0 check (paid >= 0 and paid <= amount),
  due_date date,
  status text not null default 'open' check (status in ('open','settled','void')),
  note text,
  created_at timestamptz not null default now()
);
create index credit_items_party_idx on credit_items(party_id, status);
create table credit_payments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references credit_items(id) on delete restrict,
  amount int not null check (amount > 0),
  account_id uuid not null references fin_accounts(id),
  journal_id uuid references fin_journals(id),
  idem_key text not null unique,
  actor text not null,
  paid_at timestamptz not null default now()
);

-- ---------- repairs ----------
create table repair_parts (
  id uuid primary key default gen_random_uuid(),
  repair_id uuid not null references repair_inquiries(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  description text not null,
  quantity int not null check (quantity > 0),
  unit_cost numeric(14,4),
  cost_unknown_qty int not null default 0,
  created_at timestamptz not null default now()
);
create table repair_payments (
  id uuid primary key default gen_random_uuid(),
  repair_id uuid not null references repair_inquiries(id) on delete restrict,
  amount int not null check (amount > 0),
  account_id uuid not null references fin_accounts(id),
  journal_id uuid references fin_journals(id),
  idem_key text not null unique,
  actor text not null,
  created_at timestamptz not null default now()
);

-- ---------- daily cash closing ----------
create table daily_closings (
  id uuid primary key default gen_random_uuid(),
  close_date date not null,
  account_id uuid not null references fin_accounts(id),
  opening int not null,
  received int not null,
  paid_out int not null,
  transfers_net int not null,
  expected int not null,
  counted int not null,
  difference int not null,
  status text not null default 'final' check (status in ('final','superseded')),
  supersedes_id uuid references daily_closings(id),
  note text,
  closed_by text not null,
  approved_by text,
  closed_at timestamptz not null default now()
);
create unique index daily_closings_one_final on daily_closings(close_date, account_id) where status = 'final';

-- ---------- row level security on every new table (see 006 and security.test.ts) ----------
alter table suppliers enable row level security;
alter table purchases enable row level security;
alter table purchase_items enable row level security;
alter table stock_movements enable row level security;
alter table fin_accounts enable row level security;
alter table fin_journals enable row level security;
alter table fin_entries enable row level security;
alter table expenses enable row level security;
alter table expense_templates enable row level security;
alter table service_entries enable row level security;
alter table pos_sales enable row level security;
alter table pos_sale_items enable row level security;
alter table credit_parties enable row level security;
alter table credit_items enable row level security;
alter table credit_payments enable row level security;
alter table repair_parts enable row level security;
alter table repair_payments enable row level security;
alter table daily_closings enable row level security;
