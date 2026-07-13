-- 0021 (impl-4): restore EXECUTE on the is_conversation_participant RLS-policy helper.
--
-- CRITICAL fix for a regression introduced by 0020_function_execute_lockdown. 0020 correctly
-- revoked EXECUTE from anon/authenticated on functions that are called DIRECTLY (get_or_create_dm
-- via rpc), are injection vectors (emit_event), or run only from triggers (fn_*_emit_event).
-- But is_conversation_participant(uuid,uuid) is different: it is a SECURITY DEFINER helper called
-- INSIDE the RLS policies conv_select / cp_select / msg_select (migration 0004). PostgreSQL evaluates
-- a policy's USING expression with the querying role's privileges, so once EXECUTE was revoked from
-- authenticated, EVERY human RLS read of conversations/participants/messages failed with
-- "permission denied for function is_conversation_participant" — silently breaking DM reads,
-- the participant directory (sender names), and Realtime postgres_changes delivery (AC1).
--
-- Re-granting is safe: the function only returns a boolean membership check (no row data), and
-- current_actor_id() still scopes it to the caller. Role-wrapped so the grant is not a CLI no-op.
-- Verified on the live stack: after this grant, an authenticated RLS read returns the participant
-- and message rows (2/2) instead of erroring.

set local role postgres;
grant execute on function is_conversation_participant(uuid, uuid) to authenticated;
reset role;

notify pgrst, 'reload schema';
