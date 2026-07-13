-- 0002: social graph, moderated content, and durable public outbox.

create table posts (
  id uuid primary key default gen_random_uuid(),
  author_actor_id uuid not null references actors(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 5000),
  ai_generated boolean not null default false,
  parent_post_id uuid references posts(id) on delete cascade,
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index posts_visible_feed_idx on posts (created_at desc, id desc) where hidden_at is null;
create index posts_author_feed_idx on posts (author_actor_id, created_at desc, id desc) where hidden_at is null;

create table follows (
  follower_actor_id uuid not null references actors(id) on delete cascade,
  followed_actor_id uuid not null references actors(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_actor_id, followed_actor_id),
  check (follower_actor_id <> followed_actor_id)
);
create index follows_followed_idx on follows (followed_actor_id, created_at desc);

create table connections (
  requester_actor_id uuid not null references actors(id) on delete cascade,
  recipient_actor_id uuid not null references actors(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (requester_actor_id, recipient_actor_id),
  check (requester_actor_id <> recipient_actor_id)
);

create table reactions (
  post_id uuid not null references posts(id) on delete cascade,
  reactor_actor_id uuid not null references actors(id) on delete cascade,
  kind text not null default 'like' check (kind in ('like', 'insightful', 'celebrate')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (post_id, reactor_actor_id)
);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  reviewer_actor_id uuid not null references actors(id) on delete cascade,
  subject_actor_id uuid not null references actors(id) on delete cascade,
  agent_version_id uuid references agent_versions(id) on delete set null,
  contract_id uuid,
  rating smallint not null check (rating between 1 and 5),
  body text not null check (char_length(trim(body)) between 1 and 5000),
  ai_generated boolean not null default false,
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (reviewer_actor_id <> subject_actor_id)
);
create index reviews_subject_visible_idx on reviews (subject_actor_id, created_at desc, id desc) where hidden_at is null;

create table flags (
  id uuid primary key default gen_random_uuid(),
  flagger_actor_id uuid not null references actors(id) on delete cascade,
  subject_type text not null check (subject_type in ('post', 'review', 'actor')),
  subject_id uuid not null,
  reason text not null check (char_length(trim(reason)) between 1 and 1000),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index flags_open_unique_idx on flags (flagger_actor_id, subject_type, subject_id) where status = 'open';

create table events (
  id bigint generated always as identity primary key,
  type text not null,
  actor_id uuid references actors(id) on delete set null,
  recipient_actor_id uuid references actors(id) on delete cascade,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index events_id_type_idx on events (id, type);
create index events_recipient_id_idx on events (recipient_actor_id, id);

create or replace function emit_event(p_type text, p_actor_id uuid, p_payload jsonb, p_recipient_actor_id uuid default null)
returns void language sql as
$$ insert into events (type, actor_id, payload, recipient_actor_id)
   values (p_type, p_actor_id, coalesce(p_payload, '{}'::jsonb), p_recipient_actor_id) $$;

create or replace function fn_posts_enforce_ai_label() returns trigger language plpgsql as $$
begin
  if exists (select 1 from actors where id = new.author_actor_id and type = 'agent') then new.ai_generated := true; end if;
  return new;
end $$;
create trigger trg_posts_enforce_ai_label before insert or update of author_actor_id, ai_generated on posts for each row execute function fn_posts_enforce_ai_label();
create or replace function fn_reviews_enforce_ai_label() returns trigger language plpgsql as $$
begin
  if exists (select 1 from actors where id = new.reviewer_actor_id and type = 'agent') then new.ai_generated := true; end if;
  return new;
end $$;
create trigger trg_reviews_enforce_ai_label before insert or update of reviewer_actor_id, ai_generated on reviews for each row execute function fn_reviews_enforce_ai_label();

create or replace function fn_posts_emit_event() returns trigger language plpgsql as $$ begin perform emit_event('post.created', new.author_actor_id, jsonb_build_object('post_id', new.id)); return new; end $$;
create trigger trg_posts_emit_event after insert on posts for each row execute function fn_posts_emit_event();
create or replace function fn_reviews_emit_event() returns trigger language plpgsql as $$ begin perform emit_event('review.created', new.reviewer_actor_id, jsonb_build_object('review_id', new.id, 'subject_actor_id', new.subject_actor_id)); return new; end $$;
create trigger trg_reviews_emit_event after insert on reviews for each row execute function fn_reviews_emit_event();
create or replace function fn_reactions_emit_event() returns trigger language plpgsql as $$ begin perform emit_event('reaction.created', new.reactor_actor_id, jsonb_build_object('post_id', new.post_id, 'kind', new.kind)); return new; end $$;
create trigger trg_reactions_emit_event after insert or update of kind on reactions for each row execute function fn_reactions_emit_event();
create or replace function fn_follows_emit_event() returns trigger language plpgsql as $$ begin perform emit_event('follow.created', new.follower_actor_id, jsonb_build_object('follower_actor_id', new.follower_actor_id), new.followed_actor_id); return new; end $$;
create trigger trg_follows_emit_event after insert on follows for each row execute function fn_follows_emit_event();

create trigger trg_posts_updated_at before update on posts for each row execute function set_updated_at();
create trigger trg_connections_updated_at before update on connections for each row execute function set_updated_at();
create trigger trg_reactions_updated_at before update on reactions for each row execute function set_updated_at();
create trigger trg_reviews_updated_at before update on reviews for each row execute function set_updated_at();
create trigger trg_flags_updated_at before update on flags for each row execute function set_updated_at();

alter table posts enable row level security;
alter table follows enable row level security;
alter table connections enable row level security;
alter table reactions enable row level security;
alter table reviews enable row level security;
alter table flags enable row level security;
alter table events enable row level security;
create policy posts_select_visible on posts for select using (hidden_at is null and exists (select 1 from actors where id = author_actor_id and status = 'active'));
create policy follows_select_all on follows for select using (true);
create policy reactions_select_all on reactions for select using (true);
create policy reviews_select_visible on reviews for select using (hidden_at is null and exists (select 1 from actors where id = reviewer_actor_id and status = 'active'));
create policy connections_select_participant on connections for select using (requester_actor_id = current_actor_id() or recipient_actor_id = current_actor_id());
create policy flags_insert_own on flags for insert with check (flagger_actor_id = current_actor_id());
create policy flags_select_own on flags for select using (flagger_actor_id = current_actor_id());

grant select on posts, follows, reactions, reviews to anon, authenticated;
grant select, insert on flags to authenticated;
grant select on connections to authenticated;
grant all on posts, follows, connections, reactions, reviews, flags, events to service_role;
grant execute on function emit_event(text, uuid, jsonb, uuid) to service_role;
