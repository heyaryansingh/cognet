-- Marketplace: depends on 0002 social/events (emit_event).
create table tasks (
  id uuid primary key default gen_random_uuid(), poster_actor_id uuid not null references actors(id),
  title text not null check (char_length(title) between 3 and 200), body text not null default '', tags text[] not null default '{}',
  budget_min numeric, budget_max numeric, status text not null default 'open' check (status in ('open','assigned','completed','cancelled')),
  parent_contract_id uuid, acceptance_spec jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (budget_min is null or budget_max is null or budget_min <= budget_max)
);
create index tasks_status_created_idx on tasks(status, created_at desc, id desc);
create index tasks_poster_idx on tasks(poster_actor_id);
create trigger trg_tasks_updated_at before update on tasks for each row execute function set_updated_at();

create table bids (
  id uuid primary key default gen_random_uuid(), task_id uuid not null references tasks(id), bidder_actor_id uuid not null references actors(id),
  amount numeric not null check(amount >= 0), proposal text not null default '' check(char_length(proposal) <= 4000),
  status text not null default 'pending' check(status in ('pending','accepted','rejected','withdrawn')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index bids_task_idx on bids(task_id, created_at desc, id desc); create index bids_bidder_idx on bids(bidder_actor_id, created_at desc);
create unique index bids_one_pending_per_bidder on bids(task_id,bidder_actor_id) where status='pending';
create unique index bids_one_accepted_per_task on bids(task_id) where status='accepted';
create trigger trg_bids_updated_at before update on bids for each row execute function set_updated_at();

create table contracts (
  id uuid primary key default gen_random_uuid(), task_id uuid not null unique references tasks(id), bid_id uuid not null unique references bids(id),
  client_actor_id uuid not null references actors(id), provider_actor_id uuid not null references actors(id), amount numeric not null check(amount >= 0),
  status text not null default 'active' check(status in ('active','delivered','completed','cancelled','disputed','resolved_completed','resolved_cancelled')),
  parent_contract_id uuid references contracts(id), demo boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(client_actor_id <> provider_actor_id)
);
create index contracts_client_idx on contracts(client_actor_id,created_at desc,id desc); create index contracts_provider_idx on contracts(provider_actor_id,created_at desc,id desc);
alter table tasks add constraint tasks_parent_contract_id_fkey foreign key(parent_contract_id) references contracts(id);
alter table reviews add constraint reviews_contract_id_fkey foreign key(contract_id) references contracts(id);
create trigger trg_contracts_updated_at before update on contracts for each row execute function set_updated_at();

create function fn_contracts_transition_check() returns trigger language plpgsql as $$ begin
 if old.status <> new.status and not ((old.status='active' and new.status in ('delivered','disputed','cancelled')) or (old.status='delivered' and new.status in ('completed','disputed')) or (old.status='disputed' and new.status in ('resolved_completed','resolved_cancelled'))) then raise exception 'invalid contract transition % -> %',old.status,new.status using errcode='check_violation'; end if;
 if old.parent_contract_id is distinct from new.parent_contract_id then raise exception 'parent_contract_id is immutable' using errcode='check_violation'; end if; return new; end $$;
create trigger trg_contracts_transition_check before update on contracts for each row execute function fn_contracts_transition_check();

create table contract_events (id uuid primary key default gen_random_uuid(), contract_id uuid not null references contracts(id), from_status text, to_status text not null, actor_id uuid references actors(id), note text, created_at timestamptz not null default now());
create index contract_events_contract_idx on contract_events(contract_id,created_at);
create function fn_contracts_log_event() returns trigger language plpgsql as $$ declare acting uuid:=coalesce(nullif(current_setting('app.actor_id',true),'')::uuid,current_actor_id()); begin if tg_op='INSERT' then insert into contract_events(contract_id,to_status,actor_id) values(new.id,new.status,acting); elsif old.status<>new.status then insert into contract_events(contract_id,from_status,to_status,actor_id) values(new.id,old.status,new.status,acting); end if; return new; end $$;
create trigger trg_contracts_log_event after insert or update on contracts for each row execute function fn_contracts_log_event();
create function fn_contracts_sync_task() returns trigger language plpgsql as $$ begin
 if old.status <> new.status and new.status in ('completed','resolved_completed') then update tasks set status='completed' where id=new.task_id; end if;
 if old.status <> new.status and new.status in ('cancelled','resolved_cancelled') then update tasks set status='cancelled' where id=new.task_id; end if;
 return new; end $$;
create trigger trg_contracts_sync_task after update on contracts for each row execute function fn_contracts_sync_task();

create table endorsements (id uuid primary key default gen_random_uuid(), contract_id uuid not null references contracts(id), endorser_actor_id uuid not null references actors(id), endorsed_actor_id uuid not null references actors(id), body text check(char_length(body)<=500), created_at timestamptz not null default now(), unique(contract_id,endorser_actor_id));
create index endorsements_endorsed_idx on endorsements(endorsed_actor_id,created_at desc,id desc);
create function fn_endorsements_contract_check() returns trigger language plpgsql as $$ declare c contracts%rowtype; begin select * into c from contracts where id=new.contract_id; if c.status not in ('completed','resolved_completed') then raise exception 'endorsement requires a completed contract' using errcode='check_violation'; end if; if c.demo then raise exception 'demo contracts cannot be endorsed' using errcode='check_violation'; end if; if new.endorser_actor_id<>c.client_actor_id then raise exception 'only the contract client may endorse' using errcode='check_violation'; end if; if new.endorsed_actor_id<>c.provider_actor_id then raise exception 'endorsed actor must be the contract provider' using errcode='check_violation'; end if; if (select count(*) from endorsements where endorser_actor_id=new.endorser_actor_id and created_at>now()-interval '24 hours')>=5 then raise exception 'endorsement rate limit exceeded' using errcode='check_violation'; end if; return new; end $$;
create trigger trg_endorsements_contract_check before insert on endorsements for each row execute function fn_endorsements_contract_check();

create function accept_bid(p_acting_actor_id uuid,p_bid_id uuid) returns contracts language plpgsql as $$ declare b bids%rowtype;t tasks%rowtype;c contracts%rowtype; begin perform set_config('app.actor_id',p_acting_actor_id::text,true); select * into b from bids where id=p_bid_id for update; if not found then raise exception 'bid not found' using errcode='no_data_found'; end if; select * into t from tasks where id=b.task_id for update; if t.poster_actor_id<>p_acting_actor_id then raise exception 'only the task poster may accept a bid' using errcode='insufficient_privilege'; end if; if t.status<>'open' or b.status<>'pending' then raise exception 'task or bid is no longer available' using errcode='check_violation'; end if; update bids set status='accepted' where id=b.id; update bids set status='rejected' where task_id=t.id and id<>b.id and status='pending'; insert into contracts(task_id,bid_id,client_actor_id,provider_actor_id,amount,parent_contract_id) values(t.id,b.id,t.poster_actor_id,b.bidder_actor_id,b.amount,t.parent_contract_id) returning * into c; update tasks set status='assigned' where id=t.id; return c; end $$;
create function transition_contract(p_acting_actor_id uuid,p_contract_id uuid,p_to_status text) returns contracts language plpgsql as $$ declare c contracts%rowtype; begin perform set_config('app.actor_id',p_acting_actor_id::text,true); select * into c from contracts where id=p_contract_id for update; if not found then raise exception 'contract not found' using errcode='no_data_found'; end if; if not ((p_to_status='delivered' and p_acting_actor_id=c.provider_actor_id) or (p_to_status in ('completed','disputed') and p_acting_actor_id=c.client_actor_id) or (p_to_status='cancelled' and p_acting_actor_id in(c.client_actor_id,c.provider_actor_id))) then raise exception 'actor may not drive this transition' using errcode='insufficient_privilege'; end if; update contracts set status=p_to_status where id=c.id returning * into c; return c; end $$;

create function fn_tasks_emit_event() returns trigger language plpgsql as $$ begin perform emit_event('task.created',new.poster_actor_id,jsonb_build_object('id',new.id,'title',new.title)); return new; end $$;
create trigger trg_tasks_emit_event after insert on tasks for each row execute function fn_tasks_emit_event();
create function fn_bids_emit_event() returns trigger language plpgsql as $$ declare p uuid; begin select poster_actor_id into p from tasks where id=new.task_id; perform emit_event('bid.created',new.bidder_actor_id,jsonb_build_object('id',new.id,'task_id',new.task_id),p); return new; end $$;
create trigger trg_bids_emit_event after insert on bids for each row execute function fn_bids_emit_event();
create function fn_contracts_emit_event() returns trigger language plpgsql as $$ declare typ text:=case when tg_op='INSERT' then 'contract.created' else 'contract.updated' end; acting uuid:=coalesce(nullif(current_setting('app.actor_id',true),'')::uuid,current_actor_id()); begin if tg_op='UPDATE' and old.status=new.status then return new; end if; perform emit_event(typ,acting,jsonb_build_object('id',new.id,'status',new.status),new.client_actor_id); perform emit_event(typ,acting,jsonb_build_object('id',new.id,'status',new.status),new.provider_actor_id); return new; end $$;
create trigger trg_contracts_emit_event after insert or update on contracts for each row execute function fn_contracts_emit_event();

alter table tasks enable row level security; alter table bids enable row level security; alter table contracts enable row level security; alter table contract_events enable row level security; alter table endorsements enable row level security;
create policy tasks_select_all on tasks for select using(true); create policy tasks_insert_poster on tasks for insert with check(poster_actor_id=current_actor_id()); create policy tasks_update_poster on tasks for update using(poster_actor_id=current_actor_id());
create policy bids_select_parties on bids for select using(bidder_actor_id=current_actor_id() or exists(select 1 from tasks t where t.id=bids.task_id and t.poster_actor_id=current_actor_id())); create policy bids_insert_bidder on bids for insert with check(bidder_actor_id=current_actor_id()); create policy bids_update_bidder on bids for update using(bidder_actor_id=current_actor_id());
create policy contracts_select_parties on contracts for select using(client_actor_id=current_actor_id() or provider_actor_id=current_actor_id()); create policy contract_events_select_parties on contract_events for select using(exists(select 1 from contracts c where c.id=contract_events.contract_id and(current_actor_id() in(c.client_actor_id,c.provider_actor_id))));
create policy endorsements_select_all on endorsements for select using(true); create policy endorsements_insert_endorser on endorsements for insert with check(endorser_actor_id=current_actor_id());
