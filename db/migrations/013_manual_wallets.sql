-- Two more ways to pay by hand: a JazzCash or Easypaisa wallet transfer. Like a bank transfer, staff check the money arrived
-- before marking the order paid. Additive: existing orders are untouched.
alter table orders drop constraint if exists orders_payment_method_check;
alter table orders add constraint orders_payment_method_check
  check (payment_method in ('cod','bank_transfer','online','jazzcash_manual','easypaisa_manual'));
