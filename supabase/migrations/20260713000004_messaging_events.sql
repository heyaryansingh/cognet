-- Phase 3 messaging. Events/emit_event are created by 0002.
begin;

create table conversations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references actors(id),
  is_group boolean not null default false,
  last_message_at timestamptz,
  last_message_preview text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_conversations_updated_at before update on conversations for each row execute function set_updated_at();

create table conversation_participants (
  conversation_id uuid not null references conversations(id) on delete cascade,
  participant_actor_id uuid not null references actors(id),
  added_at timestamptz not null default now(),
  last_read_at timestamptz,
  muted boolean not null default false,
  primary key (conversation_id, participant_actor_id)
);
create index conversation_participants_actor_idx on conversation_participants (participant_actor_id);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_actor_id uuid not null references actors(id),
  body text not null check (char_length(body) between 1 and 8000),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index messages_conversation_keyset_idx on messages (conversation_id, created_at desc, id desc);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_actor_id uuid not null references actors(id) on delete cascade,
  type text not null,
  actor_id uuid references actors(id),
  subject_type text,
  subject_id uuid,
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_recipient_keyset_idx on notifications (recipient_actor_id, created_at desc, id desc);

alter table conversations enable row level security;
alter table conversation_participants enable row level security;
alter table messages enable row level security;
alter table notifications enable row level security;

create or replace function is_conversation_participant(p_conversation_id uuid, p_actor_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from conversation_participants where conversation_id = p_conversation_id and participant_actor_id = p_actor_id)
$$;
revoke all on function is_conversation_participant(uuid, uuid) from public;
grant execute on function is_conversation_participant(uuid, uuid) to authenticated;

create policy conversations_select_participant on conversations for select using (is_conversation_participant(id, current_actor_id()));
create policy conversations_insert_self on conversations for insert with check (created_by = current_actor_id());
create policy conversation_participants_select_participant on conversation_participants for select using (is_conversation_participant(conversation_id, current_actor_id()));
create policy conversation_participants_insert_member on conversation_participants for insert with check (is_conversation_participant(conversation_id, current_actor_id()) or exists (select 1 from conversations c where c.id = conversation_id and c.created_by = current_actor_id()));
create policy conversation_participants_update_self on conversation_participants for update using (participant_actor_id = current_actor_id()) with check (participant_actor_id = current_actor_id());
create policy conversation_participants_delete_self on conversation_participants for delete using (participant_actor_id = current_actor_id());
create policy messages_select_participant on messages for select using (is_conversation_participant(conversation_id, current_actor_id()));
create policy messages_insert_participant on messages for insert with check (sender_actor_id = current_actor_id() and is_conversation_participant(conversation_id, current_actor_id()));
create policy notifications_select_recipient on notifications for select using (recipient_actor_id = current_actor_id());
create policy notifications_update_recipient on notifications for update using (recipient_actor_id = current_actor_id()) with check (recipient_actor_id = current_actor_id());

-- Atomic DM de-duplication. The advisory lock means two simultaneous opens return one thread.
create or replace function get_or_create_dm(p_acting_actor_id uuid, p_other_actor_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_first uuid; v_second uuid;
begin
  if p_acting_actor_id = p_other_actor_id then raise exception 'Cannot message yourself'; end if;
  v_first := least(p_acting_actor_id, p_other_actor_id); v_second := greatest(p_acting_actor_id, p_other_actor_id);
  perform pg_advisory_xact_lock(hashtext(v_first::text || ':' || v_second::text));
  select c.id into v_id from conversations c
  where not c.is_group and (select count(*) from conversation_participants cp where cp.conversation_id=c.id)=2
    and exists (select 1 from conversation_participants where conversation_id=c.id and participant_actor_id=p_acting_actor_id)
    and exists (select 1 from conversation_participants where conversation_id=c.id and participant_actor_id=p_other_actor_id)
  limit 1;
  if v_id is null then
    insert into conversations(created_by) values (p_acting_actor_id) returning id into v_id;
    insert into conversation_participants(conversation_id, participant_actor_id) values (v_id,p_acting_actor_id),(v_id,p_other_actor_id);
  end if;
  return v_id;
end $$;
revoke all on function get_or_create_dm(uuid, uuid) from public;
grant execute on function get_or_create_dm(uuid, uuid) to service_role;

create function fn_messages_emit_event() returns trigger language plpgsql security definer set search_path = public as $$
declare rcpt uuid;
begin
  update conversations set last_message_at=new.created_at,last_message_preview=left(new.body,140) where id=new.conversation_id;
  for rcpt in select participant_actor_id from conversation_participants where conversation_id=new.conversation_id and participant_actor_id <> new.sender_actor_id loop
    perform emit_event('message.created',new.sender_actor_id,jsonb_build_object('conversation_id',new.conversation_id,'message_id',new.id,'sender_actor_id',new.sender_actor_id),rcpt);
  end loop;
  return new;
end $$;
create trigger trg_messages_emit_event after insert on messages for each row execute function fn_messages_emit_event();
create function fn_notifications_emit_event() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform emit_event('notification.created',new.actor_id,jsonb_build_object('notification_id',new.id,'type',new.type,'subject_type',new.subject_type,'subject_id',new.subject_id),new.recipient_actor_id);
  return new;
end $$;
create trigger trg_notifications_emit_event after insert on notifications for each row execute function fn_notifications_emit_event();

alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table notifications;
grant select,insert,update,delete on conversations,conversation_participants,messages,notifications to authenticated;
grant all on conversations,conversation_participants,messages,notifications to service_role;
commit;
