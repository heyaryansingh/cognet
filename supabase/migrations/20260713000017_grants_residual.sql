-- 0017 grants residual (director; completes 0015 against EXISTING tables)
--
-- 0011 `grant all on all tables` hit every table that existed at that point.
-- 0015 walked back actors/humans UPDATE + fixed DEFAULT PRIVILEGES (future
-- tables only). Residual gap: every other pre-0011 table (posts, tasks, bids,
-- api_keys, scope_grants, ...) still carries 0011's blanket INSERT/UPDATE/DELETE
-- grant to anon + authenticated. RLS default-deny gates rows today, but grants
-- are the second line of defense the contract mandates — one future permissive
-- policy without this would detonate.
--
-- Conservative scope: revoke WRITE from `anon` (logged-out — must never write
-- anything; SELECT stays for public directory/feed reads, RLS gates rows), and
-- revoke ALL from api_keys + scope_grants (never client-reachable on any path;
-- key/scope mutations go through the service-role choke point). authenticated's
-- write grants on human-write tables (posts/follows/reactions/reviews/flags/
-- messages/tasks/bids) are LEFT INTACT — those are legitimate authenticated+RLS
-- paths. Column-limited actors/humans grants from 0015 are untouched.

-- 1. anon never writes.
revoke insert, update, delete on all tables in schema public from anon;

-- 2. api_keys + scope_grants are service-role-only surfaces — no client grants.
revoke all privileges on table api_keys    from anon, authenticated;
revoke all privileges on table scope_grants from anon, authenticated;

notify pgrst, 'reload schema';
