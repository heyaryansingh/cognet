-- Phase 4: evidence, transparent trust snapshots, and operational health.

create table eval_artifacts (
  id uuid primary key default gen_random_uuid(),
  agent_actor_id uuid not null references agents(actor_id) on delete cascade,
  agent_version_id uuid references agent_versions(id) on delete set null,
  suite text not null check (char_length(trim(suite)) between 2 and 100),
  score numeric(5,2) not null check (score between 0 and 100),
  artifact_url text not null check (artifact_url ~ '^https?://'),
  payload jsonb not null default '{}'::jsonb,
  format_valid boolean not null default false,
  verified_at timestamptz,
  verified_by_actor_id uuid references actors(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((verified_at is null) = (verified_by_actor_id is null))
);
create index eval_artifacts_agent_suite_idx on eval_artifacts (agent_actor_id, suite, created_at desc);

-- A heartbeat is append-only. Cron folds it into daily availability, so raw
-- pings can be retained/expired without changing the public statistic.
create table agent_heartbeats (
  id bigint generated always as identity primary key,
  agent_actor_id uuid not null references agents(actor_id) on delete cascade,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  observed_at timestamptz not null default now()
);
create index agent_heartbeats_agent_observed_idx on agent_heartbeats (agent_actor_id, observed_at desc);

create table agent_stats_daily (
  agent_actor_id uuid not null references agents(actor_id) on delete cascade,
  day date not null,
  heartbeat_count integer not null default 0 check (heartbeat_count >= 0),
  uptime_percent numeric(5,2) not null default 0 check (uptime_percent between 0 and 100),
  avg_latency_ms numeric(10,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (agent_actor_id, day)
);
create trigger trg_agent_stats_daily_updated_at before update on agent_stats_daily for each row execute function set_updated_at();

create table trust_scores (
  id uuid primary key default gen_random_uuid(),
  agent_actor_id uuid not null references agents(actor_id) on delete cascade,
  score numeric(5,2) not null check (score between 0 and 100),
  components jsonb not null,
  formula_version text not null default 'v1',
  calculated_at timestamptz not null default now()
);
create index trust_scores_agent_calculated_idx on trust_scores (agent_actor_id, calculated_at desc);

create table orgs (
  actor_id uuid primary key references actors(id) on delete cascade,
  website_url text,
  created_at timestamptz not null default now(),
  check (website_url is null or website_url ~ '^https?://')
);
create table org_verifications (
  id uuid primary key default gen_random_uuid(),
  org_actor_id uuid not null references orgs(actor_id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','verified','rejected')),
  provider text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  check (status <> 'verified' or verified_at is not null)
);
create unique index org_verifications_one_verified_idx on org_verifications (org_actor_id) where status = 'verified';

-- Public read-only leaderboard source. A normal view stays current after the
-- nightly trust cron; materialize only if leaderboard query volume warrants it.
create view leaderboard_scores as
select distinct on (ea.suite, ea.agent_actor_id)
  ea.suite, ea.agent_actor_id, ea.score, ea.verified_at is not null as verified,
  a.handle, a.display_name, ag.trust_score
from eval_artifacts ea
join actors a on a.id = ea.agent_actor_id
join agents ag on ag.actor_id = ea.agent_actor_id
where ea.format_valid and ea.verified_at is not null and a.status = 'active'
order by ea.suite, ea.agent_actor_id, ea.score desc, ea.created_at desc;

alter table eval_artifacts enable row level security;
alter table agent_heartbeats enable row level security;
alter table agent_stats_daily enable row level security;
alter table trust_scores enable row level security;
alter table orgs enable row level security;
alter table org_verifications enable row level security;
create policy eval_artifacts_select_public on eval_artifacts for select using (format_valid);
create policy agent_stats_daily_select_public on agent_stats_daily for select using (true);
create policy trust_scores_select_public on trust_scores for select using (true);
create policy orgs_select_public on orgs for select using (true);
create policy org_verifications_select_verified on org_verifications for select using (status = 'verified');
grant select on eval_artifacts, agent_stats_daily, trust_scores, orgs, org_verifications, leaderboard_scores to anon, authenticated;
grant all on eval_artifacts, agent_heartbeats, agent_stats_daily, trust_scores, orgs, org_verifications to service_role;
