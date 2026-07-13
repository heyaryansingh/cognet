-- DRAFT (H1) — do not apply. Blocked on: impl-1 0001 merge + director schema-approval broadcast.
-- Phase 2 social migration (impl-2). Conforms to coord/CONTRACT.md incl. amendments A1/A2/A5/A7.
-- Promote to supabase/migrations/0002_social.sql after rebase onto merged main.
-- connections: CUT per director ruling 13:08 (parked as 0002b if un-cut).

-- A15: suspension = actors.status enum in 0001 (impl-1); no ALTER here. Queries filter
-- actors.status = 'active'; flags service toggles status via service-role.

-- ---------- posts ----------
create table posts (
  id               uuid primary key default gen_random_uuid(),
  author_actor_id  uuid not null references actors(id),
  body             text not null check (length(body) between 1 and 10000),
  reply_to_post_id uuid references posts(id),
  ai_generated     boolean not null default false, -- trigger-owned; caller value ignored
  hidden_at        timestamptz,                    -- admin hide (S5); service-role writes only
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index posts_keyset_idx        on posts (created_at desc, id desc);
create index posts_author_keyset_idx on posts (author_actor_id, created_at desc, id desc);
create index posts_reply_idx         on posts (reply_to_post_id) where reply_to_post_id is not null;
create trigger trg_posts_updated_at before update on posts
  for each row execute function set_updated_at();

-- ---------- follows ----------
create table follows (
  follower_actor_id uuid not null references actors(id),
  followed_actor_id uuid not null references actors(id), -- A7 rename
  created_at        timestamptz not null default now(),
  primary key (follower_actor_id, followed_actor_id),
  check (follower_actor_id <> followed_actor_id)
);
create index follows_followed_idx on follows (followed_actor_id);

-- ---------- reactions ----------
-- PK (post, reactor) = one reaction per actor per post, kind change = upsert
-- (director ruling 13:08; packet's unique(post,actor,kind) flagged in outbox as conflict)
create table reactions (
  post_id          uuid not null references posts(id) on delete cascade,
  reactor_actor_id uuid not null references actors(id), -- A7 rename
  kind             text not null check (kind in ('like','insightful','celebrate')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (post_id, reactor_actor_id)
);
create trigger trg_reactions_updated_at before update on reactions
  for each row execute function set_updated_at();

-- ---------- reviews ----------
create table reviews (
  id                uuid primary key default gen_random_uuid(),
  subject_actor_id  uuid not null references agents(actor_id), -- A7 rename; agents only reviewable at M1
  reviewer_actor_id uuid not null references actors(id),
  rating            smallint not null check (rating between 1 and 5),
  body              text,
  contract_id       uuid,                                      -- §5.1: no FK here; impl-3 adds in 0003
  agent_version_id  uuid references agent_versions(id),        -- §5.2
  ai_generated      boolean not null default false,            -- trigger-owned
  hidden_at         timestamptz,
  created_at        timestamptz not null default now(),
  check (subject_actor_id <> reviewer_actor_id),
  unique nulls not distinct (reviewer_actor_id, subject_actor_id, contract_id)
);
create index reviews_subject_idx on reviews (subject_actor_id, created_at desc);

-- ---------- flags ----------
create table flags (
  id                uuid primary key default gen_random_uuid(),
  flagger_actor_id  uuid not null references actors(id),
  subject_type      text not null check (subject_type in ('post','review','actor')),
  subject_id        uuid not null,
  reason            text,
  status            text not null default 'open' check (status in ('open','actioned','dismissed')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (flagger_actor_id, subject_type, subject_id)
);
create index flags_status_idx on flags (status, created_at);
create trigger trg_flags_updated_at before update on flags
  for each row execute function set_updated_at();

-- ---------- events outbox (A1: impl-2 owns table + emit_event(); DDL per §2 + A1 deltas) ----------
create table events (
  id                  bigint generated always as identity primary key, -- A1
  type                text not null,
  actor_id            uuid references actors(id),           -- who CAUSED it
  recipient_actor_id  uuid references actors(id),           -- A1: who it is FOR; NULL = public
  payload             jsonb not null default '{}',
  created_at          timestamptz not null default now()
);
create index events_id_type_idx      on events (id, type);
create index events_recipient_id_idx on events (recipient_actor_id, id); -- A1

-- 4-arg per A9 (frozen-frozen per A12). SECURITY DEFINER is REQUIRED: events has RLS with zero
-- policies, and trigger functions run with invoker rights — without definer, any RLS-client
-- insert into posts/follows/reactions/reviews would fail when its trigger writes the outbox row.
create function emit_event(p_type text, p_actor_id uuid, p_payload jsonb,
                           p_recipient_actor_id uuid default null)
returns void language sql security definer set search_path = public as
$$ insert into events (type, actor_id, payload, recipient_actor_id)
   values (p_type, p_actor_id, p_payload, p_recipient_actor_id) $$;

-- ---------- AI-label triggers (packet H1: BEFORE INSERT/UPDATE, recompute => cannot drift) ----------
create function fn_posts_ai_label() returns trigger
language plpgsql as $$
begin
  select (type = 'agent') into strict new.ai_generated
  from actors where id = new.author_actor_id;
  return new;
end $$;
create trigger trg_posts_ai_label before insert or update on posts
  for each row execute function fn_posts_ai_label();

create function fn_reviews_ai_label() returns trigger
language plpgsql as $$
begin
  select (type = 'agent') into strict new.ai_generated
  from actors where id = new.reviewer_actor_id;
  return new;
end $$;
create trigger trg_reviews_ai_label before insert or update on reviews
  for each row execute function fn_reviews_ai_label();

-- ---------- outbox triggers (A1: mine = posts/follows/reactions/reviews; naming per §2) ----------
-- Emission matrix (A2): post/review/reaction.created -> public row; follow.created -> personal only.
create function fn_posts_emit_event() returns trigger
language plpgsql as $$
begin
  perform emit_event('post.created', new.author_actor_id,
    jsonb_build_object('post_id', new.id, 'author_actor_id', new.author_actor_id,
                       'ai_generated', new.ai_generated, 'reply_to_post_id', new.reply_to_post_id));
  return new;
end $$;
create trigger trg_posts_emit_event after insert on posts
  for each row execute function fn_posts_emit_event();

create function fn_reviews_emit_event() returns trigger
language plpgsql as $$
begin
  perform emit_event('review.created', new.reviewer_actor_id,
    jsonb_build_object('review_id', new.id, 'subject_actor_id', new.subject_actor_id,
                       'rating', new.rating));
  return new;
end $$;
create trigger trg_reviews_emit_event after insert on reviews
  for each row execute function fn_reviews_emit_event();

create function fn_reactions_emit_event() returns trigger
language plpgsql as $$
begin
  perform emit_event('reaction.created', new.reactor_actor_id,
    jsonb_build_object('post_id', new.post_id, 'kind', new.kind));
  return new;
end $$;
create trigger trg_reactions_emit_event after insert on reactions
  for each row execute function fn_reactions_emit_event();

create function fn_follows_emit_event() returns trigger
language plpgsql as $$
begin
  perform emit_event('follow.created', new.follower_actor_id,
    jsonb_build_object('follower_actor_id', new.follower_actor_id),
    new.followed_actor_id); -- personal row only (A2)
  return new;
end $$;
create trigger trg_follows_emit_event after insert on follows
  for each row execute function fn_follows_emit_event();

-- ---------- RLS (§3.4: same file, default deny, current_actor_id() only) ----------
alter table posts     enable row level security;
alter table follows   enable row level security;
alter table reactions enable row level security;
alter table reviews   enable row level security;
alter table flags     enable row level security;
alter table events    enable row level security; -- zero policies: service-role only

create policy posts_select_all  on posts for select using (hidden_at is null);
create policy posts_insert_own  on posts for insert with check (author_actor_id = current_actor_id());
create policy posts_delete_own  on posts for delete using (author_actor_id = current_actor_id());

create policy follows_select_all on follows for select using (true);
create policy follows_insert_own on follows for insert with check (follower_actor_id = current_actor_id());
create policy follows_delete_own on follows for delete using (follower_actor_id = current_actor_id());

create policy reactions_select_all on reactions for select using (true);
create policy reactions_insert_own on reactions for insert with check (reactor_actor_id = current_actor_id());
create policy reactions_update_own on reactions for update using (reactor_actor_id = current_actor_id());
create policy reactions_delete_own on reactions for delete using (reactor_actor_id = current_actor_id());

create policy reviews_select_all on reviews for select using (hidden_at is null);
create policy reviews_insert_own on reviews for insert with check (reviewer_actor_id = current_actor_id());

create policy flags_insert_own on flags for insert with check (flagger_actor_id = current_actor_id());
create policy flags_select_own on flags for select using (flagger_actor_id = current_actor_id());
