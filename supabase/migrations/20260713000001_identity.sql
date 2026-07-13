-- 0001: identity foundation — actors / humans / agents / agent_versions / api_keys
-- DDL transcribed verbatim from coord/CONTRACT.md §1 (frozen) + §2 helpers,
-- amendments A3 (scope registry lives app-side) and A10 (attribution — no
-- attribution triggers needed in 0001).
-- RLS is human-only (default deny); agent writes go through the service-role
-- choke point (withAgentAuth) in the app layer.

create extension if not exists citext;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums

create type actor_type   as enum ('human', 'agent', 'org');
create type agent_source as enum ('registered', 'scraped');

-- ---------------------------------------------------------------- actors

create table actors (
  id            uuid primary key default gen_random_uuid(),
  type          actor_type not null,
  handle        citext not null unique check (handle ~ '^[a-z0-9][a-z0-9-]{1,38}$'),
  display_name  text not null,
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------- humans

create table humans (
  actor_id      uuid primary key references actors(id) on delete cascade,
  auth_user_id  uuid not null unique references auth.users(id) on delete cascade,
  bio           text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ------------------------------------------------------------------ agents

create table agents (
  actor_id            uuid primary key references actors(id) on delete cascade,
  creator_actor_id    uuid references actors(id),             -- NULL = unclaimed (gated: no bids/DMs)
  source              agent_source not null default 'registered',
  current_version_id  uuid,                                   -- FK added after agent_versions below
  tagline             text,
  description         text,
  trust_score         numeric(5,2),                           -- denormalized; NULL until Phase 4 cron
  search_tsv          tsvector not null default ''::tsvector, -- maintained by trg_agents_search_tsv
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index agents_search_tsv_idx  on agents using gin (search_tsv);
create index agents_trust_score_idx on agents (trust_score desc nulls last);

-- ---------------------------------------------------------- agent_versions

create table agent_versions (
  id                        uuid primary key default gen_random_uuid(),
  agent_actor_id            uuid not null references agents(actor_id) on delete cascade,
  version                   text not null,
  capabilities              jsonb not null default '{}',
  pricing                   jsonb not null default '{}',
  endpoints                 jsonb not null default '{}',
  self_reported_benchmarks  jsonb not null default '[]',
  changelog                 text,
  created_at                timestamptz not null default now(),
  unique (agent_actor_id, version)
);
alter table agents add constraint agents_current_version_fkey
  foreign key (current_version_id) references agent_versions(id);

-- ---------------------------------------------------------------- api_keys

create table api_keys (
  id              uuid primary key default gen_random_uuid(),
  agent_actor_id  uuid not null references agents(actor_id) on delete cascade,
  name            text not null default 'default',
  key_prefix      text not null unique,   -- first 8 chars after 'cgt_'; lookup key
  key_hash        text not null,          -- sha256 hex of full 'cgt_...' string; plaintext never stored
  scopes          text[] not null default '{}',
  last_used_at    timestamptz,
  expires_at      timestamptz,            -- rotation: old key set to now() + interval '24 hours'
  revoked_at      timestamptz,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------- helpers

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_actors_updated_at
  before update on actors
  for each row execute function set_updated_at();

create trigger trg_humans_updated_at
  before update on humans
  for each row execute function set_updated_at();

create trigger trg_agents_updated_at
  before update on agents
  for each row execute function set_updated_at();

-- contract §2, verbatim
create function current_actor_id() returns uuid
language sql stable security definer set search_path = public as
$$ select actor_id from humans where auth_user_id = auth.uid() $$;

-- ----------------------------------------------------------- search vector

create or replace function fn_agents_search_tsv()
returns trigger
language plpgsql
as $$
declare
  v_display_name text;
  v_handle text;
begin
  select display_name, handle::text
    into v_display_name, v_handle
    from actors
   where id = new.actor_id;

  new.search_tsv :=
       setweight(to_tsvector('simple', coalesce(v_display_name, '')), 'A')
    || setweight(to_tsvector('simple', coalesce(v_handle, '')), 'A')
    || setweight(to_tsvector('english', coalesce(new.tagline, '')), 'B')
    || setweight(to_tsvector('english', coalesce(new.description, '')), 'C');
  return new;
end;
$$;

create trigger trg_agents_search_tsv
  before insert or update of tagline, description on agents
  for each row execute function fn_agents_search_tsv();

-- sync agent search vector when the actor's name/handle changes
create or replace function fn_actors_sync_agent_tsv()
returns trigger
language plpgsql
as $$
begin
  if new.type = 'agent'
     and (new.display_name is distinct from old.display_name
          or new.handle is distinct from old.handle) then
    -- no-op update fires trg_agents_search_tsv
    update agents set tagline = tagline where actor_id = new.id;
  end if;
  return new;
end;
$$;

create trigger trg_actors_sync_agent_tsv
  after update on actors
  for each row execute function fn_actors_sync_agent_tsv();

-- ------------------------------------------------------------ signup trigger

-- On auth signup: create the actor + humans rows. Handle comes from
-- raw_user_meta_data.handle if present, else email local part; uniquified
-- with a numeric suffix on collision.
create or replace function fn_auth_users_create_human()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_handle text;
  candidate   text;
  new_actor_id uuid;
  i int := 0;
begin
  base_handle := lower(coalesce(
    nullif(new.raw_user_meta_data ->> 'handle', ''),
    split_part(new.email, '@', 1)
  ));
  -- sanitize into handle alphabet
  base_handle := regexp_replace(base_handle, '[^a-z0-9-]', '-', 'g');
  base_handle := regexp_replace(base_handle, '(^-+|-+$)', '', 'g');
  if char_length(base_handle) < 2 then
    base_handle := 'user-' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;
  base_handle := substr(base_handle, 1, 30);

  candidate := base_handle;
  loop
    exit when not exists (select 1 from actors where handle = candidate);
    i := i + 1;
    candidate := base_handle || '-' || i::text;
  end loop;

  insert into actors (type, handle, display_name)
  values (
    'human',
    candidate,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      split_part(new.email, '@', 1)
    )
  )
  returning id into new_actor_id;

  insert into humans (actor_id, auth_user_id)
  values (new_actor_id, new.id);

  return new;
end;
$$;

create trigger trg_auth_users_create_human
  after insert on auth.users
  for each row execute function fn_auth_users_create_human();

-- --------------------------------------------------------------------- RLS
-- Default deny: RLS enabled everywhere; only explicitly-granted reads/writes.
-- Human policies resolve identity via current_actor_id(), never raw auth.uid()
-- (contract §2). Agent-side writes bypass RLS via the service-role choke point.

alter table actors enable row level security;
alter table humans enable row level security;
alter table agents enable row level security;
alter table agent_versions enable row level security;
alter table api_keys enable row level security;

-- public directory/profiles: anyone can read actors, agents, versions
create policy actors_select_all on actors
  for select using (true);

create policy agents_select_all on agents
  for select using (true);

create policy agent_versions_select_all on agent_versions
  for select using (true);

-- humans: own row readable + bio editable
create policy humans_select_own on humans
  for select using (actor_id = current_actor_id());

create policy humans_update_own on humans
  for update
  using (actor_id = current_actor_id())
  with check (actor_id = current_actor_id());

-- humans can edit their own actor row (display name / avatar)
create policy actors_update_own on actors
  for update
  using (id = current_actor_id())
  with check (id = current_actor_id());

-- api_keys: ZERO policies — service-role access only (contract §1).

-- ------------------------------------------------------------------ grants
-- RLS decides rows; grants decide tables. Client roles get only what the
-- policies above expose. api_keys gets no client grants at all.

grant usage on schema public to anon, authenticated, service_role;

grant select on actors, agents, agent_versions to anon, authenticated;
grant update on actors, humans to authenticated;
grant select on humans to authenticated;

grant all on actors, humans, agents, agent_versions, api_keys to service_role;

grant execute on function current_actor_id() to anon, authenticated;
