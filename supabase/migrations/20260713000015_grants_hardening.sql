-- 0015 grants hardening (director; closes audit CRITICAL + HIGH from 0011 blanket grants)
--
-- 0011 ran `grant all on all tables ... to anon, authenticated` to fix the real
-- service_role P0, but overshot: authenticated then held UPDATE on EVERY column of
-- actors/humans (Postgres grants are additive and superseded 0001's column-limited
-- grants). RLS gates rows, not columns, so a suspended human could
-- `PATCH /rest/v1/actors?id=eq.<self>` {status:active} to self-un-suspend, or rewrite
-- humans.auth_user_id (identity remap). 0011 also re-granted EXECUTE on the SECURITY
-- DEFINER `get_or_create_dm` that 0004 deliberately locked to service_role — an
-- authenticated user could forge conversations attributed to arbitrary actors.
--
-- Surgical fix: re-tighten only the two exploit surfaces. Content-write grants
-- (posts/follows/reactions/reviews/flags/tasks/bids/messages) are LEFT INTACT — those
-- are legitimate authenticated+RLS human-write paths. A broader per-table grant audit
-- is delegated to the owning agents (see coord/AUDIT_FINDINGS.md).

-- 1. actors / humans: strip blanket UPDATE, restore 0001 column-limited grants.
revoke update on actors from anon, authenticated;
revoke update on humans from anon, authenticated;
revoke delete on actors, humans from anon, authenticated;
grant update (display_name, avatar_url) on actors to authenticated;
grant update (bio) on humans to authenticated;

-- 2. Re-lock the spoofable SECURITY DEFINER DM factory (0004 intent).
revoke execute on function get_or_create_dm(uuid, uuid) from anon, authenticated, public;

-- 3. Stop future tables from auto-granting write to client roles (0011 default privs).
alter default privileges in schema public
  revoke insert, update, delete on tables from anon, authenticated;

notify pgrst, 'reload schema';
