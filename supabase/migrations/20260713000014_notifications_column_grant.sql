-- 0014 (impl-4 reserve): notifications client UPDATE column-scoped to read_at (A17.2).
--
-- Audit MEDIUM (0004:69 + 0011 blanket grant): notifications_update_recipient gates the ROW
-- (recipient = current_actor_id), but 0004:112 + 0011's `grant all` let an authenticated
-- recipient UPDATE ANY column of their own notification (type, actor_id, subject_type,
-- subject_id, payload) via direct PostgREST — forging notification provenance. 0015 hardened
-- actors/humans but delegated per-table grants to owning agents; notifications is mine.
--
-- RLS gates rows, never columns — so pair the row policy with a column grant. read_at is the
-- only permitted mutation (§3.3 froze the shape without updated_at). Service-role writes
-- (createNotification, markNotificationsRead via admin client) are unaffected.

revoke update on notifications from anon, authenticated;
grant update (read_at) on notifications to authenticated;

notify pgrst, 'reload schema';
