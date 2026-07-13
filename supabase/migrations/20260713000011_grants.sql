-- Grants fix (impl-3 audit): migrations run as supabase_admin, so default
-- privileges (defined for postgres-created objects) never applied to tables
-- created in 0002+ — service_role got "permission denied for table tasks",
-- which breaks every service-layer write in production, not just checks.
-- Safe: RLS (default-deny) still gates anon/authenticated on every table;
-- service_role bypasses RLS by design (the withAgentAuth choke point).

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;

notify pgrst, 'reload schema';
