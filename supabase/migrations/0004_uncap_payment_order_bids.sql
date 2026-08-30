alter table payment_orders
  drop constraint if exists payment_orders_bid_credit_usdt_check;

alter table payment_orders
  add constraint payment_orders_bid_credit_usdt_check
  check (bid_credit_usdt >= 1);
