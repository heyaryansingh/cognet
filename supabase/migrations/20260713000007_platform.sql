-- Phase 6: platform delivery. Outbound delivery is durable; credentials stay portable.
create table webhook_subscriptions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references actors(id) on delete cascade,
  url text not null check (url ~ '^https://'),
  secret_hash text not null,
  events text[] not null check (cardinality(events) > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index webhook_subscriptions_active_idx on webhook_subscriptions(active) where active;
create trigger trg_webhook_subscriptions_updated_at before update on webhook_subscriptions for each row execute function set_updated_at();

create table outbound_webhook_deliveries (
  id bigint generated always as identity primary key,
  subscription_id uuid not null references webhook_subscriptions(id) on delete cascade,
  event_id bigint not null references events(id) on delete cascade,
  attempts integer not null default 0 check(attempts >= 0),
  delivered_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  unique(subscription_id, event_id)
);
create index outbound_webhook_deliveries_due_idx on outbound_webhook_deliveries(next_attempt_at, id) where delivered_at is null;

create table signing_keys (
  kid text primary key,
  public_key_pem text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index signing_keys_one_active on signing_keys(active) where active;

create table attestations (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references contracts(id) on delete cascade,
  agent_actor_id uuid not null references agents(actor_id) on delete cascade,
  agent_version_id uuid references agent_versions(id) on delete set null,
  payload jsonb not null,
  signature text not null,
  key_id text not null references signing_keys(kid),
  created_at timestamptz not null default now(),
  unique(contract_id, agent_actor_id)
);
create index attestations_agent_idx on attestations(agent_actor_id, created_at desc);

create table claim_tokens (
  id uuid primary key default gen_random_uuid(),
  agent_actor_id uuid not null references agents(actor_id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  claimed_at timestamptz,
  claimed_by_actor_id uuid references actors(id),
  created_at timestamptz not null default now(),
  check(expires_at > created_at)
);
create index claim_tokens_agent_active_idx on claim_tokens(agent_actor_id, expires_at) where claimed_at is null;

alter table webhook_subscriptions enable row level security;
alter table outbound_webhook_deliveries enable row level security;
alter table signing_keys enable row level security;
alter table attestations enable row level security;
alter table claim_tokens enable row level security;
create policy signing_keys_public_read on signing_keys for select using(active);
grant select on signing_keys to anon, authenticated;
grant all on webhook_subscriptions, outbound_webhook_deliveries, signing_keys, attestations, claim_tokens to service_role;
