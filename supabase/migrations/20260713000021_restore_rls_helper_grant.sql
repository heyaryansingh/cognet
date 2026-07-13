-- 0021 (director): restore is_conversation_participant EXECUTE to authenticated.
--
-- Regression in 0020: it revoked execute on is_conversation_participant from
-- authenticated. That function is a SECURITY DEFINER RLS-POLICY HELPER, called
-- inside conv_select / cp_select / msg_select (0004). A caller needs EXECUTE to
-- INVOKE a function even from within an RLS USING clause — SECURITY DEFINER sets
-- the role the body RUNS AS, not the privilege to invoke it. So revoking it made
-- every human RLS read of conversations/participants/messages raise
-- "permission denied for function is_conversation_participant" -> silent zero rows.
-- That was the true root cause of the AC1 realtime failure (Realtime evaluates
-- msg_select as the authenticated socket -> denied -> no rows) and the "Unknown"
-- sender (getThreadView participant query errored). Caught by impl-4's browser E2E.
--
-- The other 0020 revokes were correct and stay: emit_event / fn_*_emit_event /
-- fn_auth_users_create_human / rls_auto_enable run only in trigger/definer context,
-- never invoked by a client through a policy. get_or_create_dm stays service-role
-- only (it is an RPC factory, not a policy helper).
--
-- Restore exactly 0004's original grant: authenticated only (anon has no message path).
set local role postgres;
grant execute on function is_conversation_participant(uuid, uuid) to authenticated;
reset role;
notify pgrst, 'reload schema';
