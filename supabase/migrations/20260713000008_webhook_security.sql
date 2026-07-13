-- Raw webhook secrets must remain recoverable only by the application so
-- receivers can verify signatures with the one-time secret they received.
alter table webhook_subscriptions
  add column secret_ciphertext text,
  add column last_enqueued_event_id bigint not null default 0;

create index webhook_subscriptions_enqueue_idx
  on webhook_subscriptions (last_enqueued_event_id, id) where active;
create index events_type_id_idx on events (type, id);
