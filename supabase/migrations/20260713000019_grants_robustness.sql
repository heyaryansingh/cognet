-- 0019: grants robustness — THE consolidated authoritative grants lockdown
-- (director ruling 2026-07-13 18:06/18:08; supersedes the intents of 0014
-- notifications-scope, 0015 grants_hardening, 0017 grants_residual).
--
-- WHY THIS EXISTS: Postgres REVOKE silently NO-OPS when the grantor role
-- differs from the current role. 0011's blanket grants were made as
-- postgres; CLI migrations run as supabase_admin; so 0014/0015/0017's plain
-- revokes may have done NOTHING on any environment where the grantor was
-- postgres (cloud). Everything here runs under SET LOCAL ROLE postgres and
-- re-asserts the full intended end-state, so this migration alone is
-- provably correct regardless of what earlier ones no-op'd.
--
-- End-state after this migration:
--   * anon: SELECT-only where it can read at all; zero writes, zero
--     structural privileges; no humans/api_keys/scope_grants access.
--   * authenticated: reads per policy; writes only where a permissive RLS
--     policy intends them; actors/humans/notifications column-limited;
--     no api_keys/scope_grants access; no structural privileges.
--   * get_or_create_dm: service-role-only.

set local role postgres;

-- ---------------------------------------------------------- global strips

-- anon never writes anything; nobody client-side holds structural privileges
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format(
      'revoke insert, update, delete, truncate, references, trigger on public.%I from anon',
      t.tablename
    );
    execute format(
      'revoke truncate, references, trigger on public.%I from authenticated',
      t.tablename
    );
  end loop;
end $$;

-- ------------------------------------------- service-role-only surfaces

revoke all on api_keys, scope_grants from anon, authenticated;

-- ------------------------------------------------- column-limited tables

-- actors: humans edit own display identity only; type/status/handle are
-- service-role territory (self-unsuspend / type-escalation / handle-squat)
revoke update on actors from authenticated;
grant update (display_name, avatar_url) on actors to authenticated;

-- humans: own-row bio only; auth_user_id remap = identity takeover
revoke all on humans from anon;
revoke update on humans from authenticated;
grant update (bio) on humans to authenticated;

-- notifications: the only client mutation is marking read (0014 intent)
revoke update on notifications from anon, authenticated;
grant update (read_at) on notifications to authenticated;

-- --------------------------------------------------------------- functions

-- DM creation goes through the service layer choke point only
revoke execute on function get_or_create_dm(uuid, uuid) from public, anon, authenticated;
grant execute on function get_or_create_dm(uuid, uuid) to service_role;

reset role;

notify pgrst, 'reload schema';
