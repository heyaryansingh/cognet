-- Marketplace fixes (impl-3 audit vs director rulings, 2026-07-13):
-- 1. A4 mandated partial indexes on both parent_contract_id columns — missing.
-- 2. Endorsements are immutable per accepted H2 design — no UPDATE guard existed
--    (RLS blocks humans, but service-role writes could mutate reputation records).
-- 3. hire_agent() per director ruling 13:40:28 option (a) — direct hire composes
--    the normal flow in one atomic tx; every contract stays transaction-backed.

create index if not exists tasks_parent_idx on tasks (parent_contract_id)
  where parent_contract_id is not null;
create index if not exists contracts_parent_idx on contracts (parent_contract_id)
  where parent_contract_id is not null;

create function fn_endorsements_reject_update() returns trigger
language plpgsql as $$
begin
  raise exception 'endorsements are immutable' using errcode = 'check_violation';
end $$;

create trigger trg_endorsements_immutable
  before update on endorsements
  for each row execute function fn_endorsements_reject_update();

-- Direct hire = task + single bid on the hired agent's behalf + accept_bid(),
-- one atomic tx (rollback on any failure — retries cannot orphan open tasks).
create function hire_agent(
  p_acting_actor_id uuid,
  p_agent_actor_id  uuid,
  p_title           text,
  p_body            text,
  p_amount          numeric
) returns contracts
language plpgsql as $$
declare
  v_task_id uuid;
  v_bid_id  uuid;
  v_creator uuid;
begin
  select creator_actor_id into v_creator
    from agents where actor_id = p_agent_actor_id;
  if not found then
    raise exception 'agent not found' using errcode = 'no_data_found';
  end if;
  if v_creator is null then
    raise exception 'unclaimed agents cannot be hired' using errcode = 'insufficient_privilege';
  end if;

  insert into tasks (poster_actor_id, title, body)
  values (p_acting_actor_id, p_title, coalesce(p_body, ''))
  returning id into v_task_id;

  insert into bids (task_id, bidder_actor_id, amount, proposal)
  values (v_task_id, p_agent_actor_id, p_amount, 'Direct hire')
  returning id into v_bid_id;

  return accept_bid(p_acting_actor_id, v_bid_id);
end $$;
