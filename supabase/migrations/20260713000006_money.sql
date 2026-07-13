-- Phase 5: Stripe state is deliberately mirrored, never inferred from the client.
create table stripe_accounts (
  actor_id uuid primary key references actors(id) on delete cascade,
  stripe_account_id text not null unique,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_stripe_accounts_updated_at before update on stripe_accounts for each row execute function set_updated_at();

create table escrows (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null unique references contracts(id) on delete restrict,
  client_actor_id uuid not null references actors(id),
  provider_actor_id uuid not null references actors(id),
  stripe_payment_intent_id text not null unique,
  amount_cents integer not null check(amount_cents >= 0),
  currency text not null default 'usd' check(currency ~ '^[a-z]{3}$'),
  status text not null default 'authorized' check(status in ('authorized','released','refunded','cancelled','failed')),
  created_at timestamptz not null default now(), released_at timestamptz, refunded_at timestamptz,
  updated_at timestamptz not null default now()
);
create index escrows_client_idx on escrows(client_actor_id, created_at desc);
create index escrows_provider_idx on escrows(provider_actor_id, created_at desc);
create trigger trg_escrows_updated_at before update on escrows for each row execute function set_updated_at();

create table webhook_deliveries (
  stripe_event_id text primary key,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz not null default now()
);

create table promotions (
  id uuid primary key default gen_random_uuid(), actor_id uuid not null references actors(id),
  target_type text not null check(target_type in ('agent','task')), target_id uuid not null,
  starts_at timestamptz not null, ends_at timestamptz not null, status text not null default 'pending' check(status in ('pending','active','ended','cancelled')),
  stripe_payment_intent_id text unique, created_at timestamptz not null default now(), check(ends_at > starts_at)
);
create index promotions_active_idx on promotions(target_type, target_id, ends_at) where status='active';

create table subscriptions (
  id uuid primary key default gen_random_uuid(), actor_id uuid not null references actors(id),
  stripe_subscription_id text not null unique, stripe_customer_id text not null,
  plan text not null check(plan in ('premium','recruiter')), status text not null,
  current_period_end timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index subscriptions_one_live_per_actor on subscriptions(actor_id) where status in ('active','trialing','past_due');
create trigger trg_subscriptions_updated_at before update on subscriptions for each row execute function set_updated_at();

alter table stripe_accounts enable row level security;
alter table escrows enable row level security;
alter table webhook_deliveries enable row level security;
alter table promotions enable row level security;
alter table subscriptions enable row level security;
create policy escrows_select_parties on escrows for select using(client_actor_id=current_actor_id() or provider_actor_id=current_actor_id());
create policy promotions_select_active on promotions for select using(status='active' or actor_id=current_actor_id());
create policy subscriptions_select_owner on subscriptions for select using(actor_id=current_actor_id());
grant all on stripe_accounts, escrows, webhook_deliveries, promotions, subscriptions to service_role;
