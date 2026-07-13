-- 0019: grants residual, part 2 (impl-1) — the delta 0015+0017 left open,
-- verified by pg ACL probes on a fresh 0001-0018 apply:
--   anon still holds SELECT on humans (grantor = postgres, so plain in-
--   migration REVOKE no-ops: migrations run as supabase_admin and REVOKE
--   only strips grants made by the current role) and TRUNCATE / REFERENCES /
--   TRIGGER on 0011-era tables (0017 revoked writes only).

set local role postgres;

-- humans is own-row-only for authenticated; anon has no legitimate read
revoke select on humans from anon;

-- strip structural privileges no client role should hold
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format(
      'revoke truncate, references, trigger on public.%I from anon, authenticated',
      t.tablename
    );
  end loop;
end $$;

reset role;

notify pgrst, 'reload schema';
