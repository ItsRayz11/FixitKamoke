-- Cash-on-delivery advance payments.
-- Additive only: every existing order keeps advance_required = 0, so nothing about live orders changes.

alter table orders add column advance_required int not null default 0 check (advance_required >= 0);
alter table orders add column advance_bps int check (advance_bps is null or (advance_bps > 0 and advance_bps <= 10000));
alter table orders add column advance_paid int not null default 0 check (advance_paid >= 0);
alter table orders add column advance_verified_at timestamptz;
alter table orders add column advance_verified_by text;
alter table orders add constraint orders_advance_within_total check (advance_required <= total and advance_paid <= total);

-- A COD order whose advance has been verified is partly paid.
alter table orders drop constraint if exists orders_payment_status_check;
alter table orders add constraint orders_payment_status_check check (payment_status in ('unpaid','pending','partial','paid','refunded','failed'));
