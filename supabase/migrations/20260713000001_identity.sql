-- 0001: identity foundation — actors / humans / agents / agent_versions / api_keys
-- Architecture rule: polymorphic actors, everything FKs to actors.id.
-- RLS is human-only (default deny); agent writes go through the service-role
-- choke point (withAgentAuth) in the app layer.

create extension if not exists citext;

-- ---------------------------------------------------------------- enums

create type public.actor_type as enum ('human', 'agent', 'org');
create type public.actor_status as enum ('active', 'suspended');
create type public.agent_source as enum ('registered', 'scraped');

-- ---------------------------------------------------------------- actors

create table public.actors (
  id           uuid primary key default gen_random_uuid(),
  type         public.actor_type not null,
  status       public.actor_status not null default 'active',
  handle       citext not null unique check (handle ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  display_name text not null check (char_length(display_name) between 1 and 80),
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------- humans

create table public.humans (
  actor_id     uuid primary key references public.actors(id) on delete cascade,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------------ agents

create table public.agents (
  actor_id         uuid primary key references public.actors(id) on delete cascade,
  -- null creator = unclaimed (scraped or orphaned self-registration); gates apply
  creator_actor_id uuid references public.actors(id) on delete set null,
  source           public.agent_source not null default 'registered',
  tagline          text check (char_length(tagline) <= 140),
  description      text,
  -- denormalized from trust_scores (Phase 4 cron); null until first computation
  trust_score      numeric(5, 2),
  search_tsv       tsvector,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index agents_trust_score_idx on public.agents (trust_score desc nulls last);
create index agents_search_tsv_idx on public.agents using gin (search_tsv);
create index agents_creator_idx on public.agents (creator_actor_id);

-- ---------------------------------------------------------- agent_versions

create table public.agent_versions (
  id              uuid primary key default gen_random_uuid(),
  agent_actor_id  uuid not null references public.agents(actor_id) on delete cascade,
  version         text not null check (char_length(version) between 1 and 40),
  changelog       text,
  capabilities    jsonb not null default '{}'::jsonb,
  pricing         jsonb not null default '{}'::jsonb,
  endpoints       jsonb not null default '{}'::jsonb,
  -- self-reported benchmark claims; verified evals live in eval_artifacts (Phase 4)
  benchmarks_self jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now(),
  unique (agent_actor_id, version)
);

create index agent_versions_agent_idx
  on public.agent_versions (agent_actor_id, created_at desc);

alter table public.agents
  add column current_version_id uuid references public.agent_versions(id);

-- ---------------------------------------------------------------- api_keys

create table public.api_keys (
  id               uuid primary key default gen_random_uuid(),
  agent_actor_id   uuid not null references public.agents(actor_id) on delete cascade,
  name             text not null default 'default',
  -- key format: cgt_<prefix><32B base62>; prefix is the lookup handle
  prefix           text not null unique,
  key_hash         text not null, -- sha256 hex of full key; plaintext never stored
  scopes           text[] not null default '{}',
  last_used_at     timestamptz,
  created_at       timestamptz not null default now(),
  revoked_at       timestamptz,
  -- rotation: old key stays valid until grace expires
  grace_expires_at timestamptz
);

create index api_keys_agent_idx on public.api_keys (agent_actor_id);

-- ---------------------------------------------------------------- helpers

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger actors_set_updated_at
  before update on public.actors
  for each row execute function public.set_updated_at();

create trigger agents_set_updated_at
  before update on public.agents
  for each row execute function public.set_updated_at();

-- Maps the authenticated Supabase user to their actor id. Security definer so
-- it works regardless of RLS on humans.
create or replace function public.current_actor_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select actor_id from public.humans where auth_user_id = auth.uid();
$$;

-- ----------------------------------------------------------- search vector

create or replace function public.agents_search_tsv_update()
returns trigger
language plpgsql
as $$
declare
  v_display_name text;
  v_handle text;
begin
  select display_name, handle::text
    into v_display_name, v_handle
    from public.actors
   where id = new.actor_id;

  new.search_tsv :=
       setweight(to_tsvector('simple', coalesce(v_display_name, '')), 'A')
    || setweight(to_tsvector('simple', coalesce(v_handle, '')), 'A')
    || setweight(to_tsvector('english', coalesce(new.tagline, '')), 'B')
    || setweight(to_tsvector('english', coalesce(new.description, '')), 'C');
  return new;
end;
$$;

create trigger agents_search_tsv
  before insert or update of tagline, description on public.agents
  for each row execute function public.agents_search_tsv_update();

-- keep agent search vector fresh when the actor's name/handle changes
create or replace function public.actors_refresh_agent_tsv()
returns trigger
language plpgsql
as $$
begin
  if new.type = 'agent'
     and (new.display_name is distinct from old.display_name
          or new.handle is distinct from old.handle) then
    -- no-op update fires agents_search_tsv trigger
    update public.agents set tagline = tagline where actor_id = new.id;
  end if;
  return new;
end;
$$;

create trigger actors_refresh_agent_tsv
  after update on public.actors
  for each row execute function public.actors_refresh_agent_tsv();

-- ------------------------------------------------------------ signup trigger

-- On auth signup: create the actor + humans rows. Handle comes from
-- raw_user_meta_data.handle if present, else email local part; uniquified
-- with a numeric suffix on collision.
create or replace function public.handle_new_user()
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
  if char_length(base_handle) < 3 then
    base_handle := 'user-' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;
  base_handle := substr(base_handle, 1, 30);

  candidate := base_handle;
  loop
    exit when not exists (select 1 from public.actors where handle = candidate);
    i := i + 1;
    candidate := base_handle || '-' || i::text;
  end loop;

  insert into public.actors (type, handle, display_name)
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

  insert into public.humans (actor_id, auth_user_id)
  values (new_actor_id, new.id);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --------------------------------------------------------------------- RLS
-- Default deny: RLS enabled everywhere; only explicitly-granted reads/writes.
-- Agent-side writes bypass RLS via the service-role choke point.

alter table public.actors enable row level security;
alter table public.humans enable row level security;
alter table public.agents enable row level security;
alter table public.agent_versions enable row level security;
alter table public.api_keys enable row level security;

-- public directory/profiles: anyone can read actors, agents, versions
create policy actors_select_all on public.actors
  for select using (true);

create policy agents_select_all on public.agents
  for select using (true);

create policy agent_versions_select_all on public.agent_versions
  for select using (true);

-- humans: only your own row
create policy humans_select_own on public.humans
  for select using (auth_user_id = (select auth.uid()));

-- humans can edit their own actor row (display name / avatar)
create policy actors_update_own on public.actors
  for update
  using (id = public.current_actor_id())
  with check (id = public.current_actor_id());

-- api_keys: no policies — deny all client access; service role only.

-- ------------------------------------------------------------------ grants
-- RLS decides rows; grants decide tables. Client roles get only what the
-- policies above expose. api_keys gets no client grants at all.

grant usage on schema public to anon, authenticated, service_role;

grant select on public.actors, public.agents, public.agent_versions
  to anon, authenticated;
grant update on public.actors to authenticated;
grant select on public.humans to authenticated;

grant all on public.actors, public.humans, public.agents,
  public.agent_versions, public.api_keys to service_role;

grant execute on function public.current_actor_id() to anon, authenticated;
