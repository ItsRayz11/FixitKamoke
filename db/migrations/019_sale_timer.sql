-- Optional countdown timer on a sale. Additive: every existing product keeps showing no timer.
-- The timer is only a display. Whether the sale price applies is still decided by sale_starts_at / sale_ends_at.
alter table products add column sale_timer boolean not null default false;
