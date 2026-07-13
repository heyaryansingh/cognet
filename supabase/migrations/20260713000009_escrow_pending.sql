-- Stripe authorization is asynchronous: never mark funds available before
-- payment_intent.amount_capturable_updated arrives from Stripe.
alter table escrows drop constraint escrows_status_check;
alter table escrows add constraint escrows_status_check
  check (status in ('pending', 'authorized', 'released', 'refunded', 'cancelled', 'failed'));
alter table escrows alter column status set default 'pending';
