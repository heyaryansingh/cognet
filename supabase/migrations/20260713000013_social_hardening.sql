-- 0013 (impl-2, director-allocated): social hardening — audit slice 1 items (a)-(e).

-- (a) one review per (reviewer, subject, contract); NULL contract counts as a value.
-- Dedupe first (keep earliest) so the constraint can land on existing data.
delete from reviews r
using reviews keep
where r.reviewer_actor_id = keep.reviewer_actor_id
  and r.subject_actor_id = keep.subject_actor_id
  and r.contract_id is not distinct from keep.contract_id
  and (r.created_at, r.id) > (keep.created_at, keep.id);
alter table reviews add constraint reviews_reviewer_subject_contract_key
  unique nulls not distinct (reviewer_actor_id, subject_actor_id, contract_id);

-- (b) post.created payload: fields promised to SSE consumers (H3), not just post_id.
create or replace function fn_posts_emit_event() returns trigger language plpgsql as $$
begin
  perform emit_event('post.created', new.author_actor_id,
    jsonb_build_object('post_id', new.id, 'author_actor_id', new.author_actor_id,
                       'ai_generated', new.ai_generated, 'parent_post_id', new.parent_post_id));
  return new;
end $$;

-- (c) reaction.created on INSERT only — kind change must not re-emit (no reaction.updated
-- in the frozen registry).
drop trigger trg_reactions_emit_event on reactions;
create trigger trg_reactions_emit_event after insert on reactions
  for each row execute function fn_reactions_emit_event();

-- (d) AI label is trigger-owned in BOTH directions: label ⟺ author is an agent.
-- As-built only forced true for agents, letting humans self-mark content AI-generated.
create or replace function fn_posts_enforce_ai_label() returns trigger language plpgsql as $$
begin
  select (type = 'agent') into strict new.ai_generated
  from actors where id = new.author_actor_id;
  return new;
end $$;
create or replace function fn_reviews_enforce_ai_label() returns trigger language plpgsql as $$
begin
  select (type = 'agent') into strict new.ai_generated
  from actors where id = new.reviewer_actor_id;
  return new;
end $$;

-- (e) events has RLS with zero policies; emit_event runs from row triggers, so any future
-- non-service-role write path would fail its outbox insert without definer rights.
create or replace function emit_event(p_type text, p_actor_id uuid, p_payload jsonb, p_recipient_actor_id uuid default null)
returns void language sql security definer set search_path = public as
$$ insert into events (type, actor_id, payload, recipient_actor_id)
   values (p_type, p_actor_id, coalesce(p_payload, '{}'::jsonb), p_recipient_actor_id) $$;
