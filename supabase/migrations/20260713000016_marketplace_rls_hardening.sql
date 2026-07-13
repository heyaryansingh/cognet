-- Marketplace RLS hardening (impl-3, A17.2 + audit finding HIGH 0003:66).
-- tasks_update_poster / bids_update_bidder were column-unrestricted client
-- UPDATE policies: an authenticated bidder could set bids.status='accepted'
-- directly (bypassing accept_bid() and its sibling-rejection/contract
-- creation), and a poster could flip tasks.status around the state machine.
-- A17.2: tasks/bids get NO client UPDATE — all state changes ride RPCs via
-- the service layer (service_role).
-- Ledger note: 0016 taken as "next free" per A17.6; director-ordered fix.

drop policy if exists tasks_update_poster on tasks;
drop policy if exists bids_update_bidder on bids;

-- Belt-and-suspenders at the grant layer (0015 pattern): client roles keep
-- select/insert per remaining policies, lose update entirely.
revoke update on tasks from anon, authenticated;
revoke update on bids from anon, authenticated;

notify pgrst, 'reload schema';
