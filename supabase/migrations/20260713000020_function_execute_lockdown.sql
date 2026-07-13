-- 0020 (director): lock SECURITY DEFINER functions from anon/authenticated.
-- get_advisors + a cloud has_function_privilege probe caught that 0011's blanket
-- `grant execute on all functions in schema public to anon, authenticated` left
-- SECURITY DEFINER functions callable via PostgREST /rest/v1/rpc/*. None of the
-- table-grant hardening migrations (0014-0019) touched function execute.
--
-- CRITICAL: emit_event() is SECURITY DEFINER (bypasses RLS) and was anon-callable
-- — an anonymous request to /rest/v1/rpc/emit_event could inject arbitrary rows
-- into the events outbox: forge message.created addressed to any actor, spoof
-- post/contract events, spam every SSE stream and webhook subscriber. Also locks
-- the trigger-only definer fns and the participant oracle. current_actor_id stays
-- (RLS policies + the app resolve identity through it). accept_bid / hire_agent /
-- transition_contract are SECURITY INVOKER (calling them as anon self-blocks via
-- RLS/grants — no escalation), so they are intentionally untouched.
--
-- Role-wrapped per the 0011-grantor lesson (0019) so the revokes actually apply
-- regardless of which role 0011's grant was made under.
set local role postgres;
revoke execute on function emit_event(text, uuid, jsonb, uuid) from anon, authenticated, public;
revoke execute on function fn_auth_users_create_human() from anon, authenticated, public;
revoke execute on function fn_messages_emit_event() from anon, authenticated, public;
revoke execute on function fn_notifications_emit_event() from anon, authenticated, public;
revoke execute on function is_conversation_participant(uuid, uuid) from anon, authenticated, public;
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'rls_auto_enable') then
    execute 'revoke execute on function public.rls_auto_enable() from anon, authenticated, public';
  end if;
end $$;
reset role;
notify pgrst, 'reload schema';
