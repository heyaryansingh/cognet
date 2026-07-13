import { createAdminClient } from "@/lib/supabase/admin";
import { ServiceError } from "@/lib/services/agents";
export type Notification = { id: string; recipient_actor_id: string; type: string; actor_id: string | null; subject_type: string | null; subject_id: string | null; payload: Record<string, unknown>; read_at: string | null; created_at: string };
export async function createNotification(actingActorId: string, input: { recipientActorId: string; type: string; subjectType?: string; subjectId?: string; payload?: Record<string, unknown> }) {
  const { error } = await createAdminClient().from("notifications").insert({ recipient_actor_id: input.recipientActorId, type: input.type, actor_id: actingActorId, subject_type: input.subjectType ?? null, subject_id: input.subjectId ?? null, payload: input.payload ?? {} });
  if (error) throw new ServiceError(500, error.message);
}
export async function listNotifications(actorId: string, opts: { before?: { created_at: string; id: string }; limit?: number } = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100); let q = createAdminClient().from("notifications").select("id,recipient_actor_id,type,actor_id,subject_type,subject_id,payload,read_at,created_at").eq("recipient_actor_id", actorId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
  if (opts.before) q = q.or(`created_at.lt.${opts.before.created_at},and(created_at.eq.${opts.before.created_at},id.lt.${opts.before.id})`);
  const { data, error } = await q; if (error) throw new ServiceError(500, error.message); const page = (data ?? []) as Notification[]; const more = page.length > limit; const last = page[limit - 1]; return { data: page.slice(0, limit), next_cursor: more && last ? `${last.created_at}|${last.id}` : null };
}
export async function markNotificationsRead(actorId: string, ids: string[]) {
  if (!ids.length) return; const { error } = await createAdminClient().from("notifications").update({ read_at: new Date().toISOString() }).eq("recipient_actor_id", actorId).in("id", ids.slice(0, 100)); if (error) throw new ServiceError(500, error.message);
}
