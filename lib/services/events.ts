import { createAdminClient } from "@/lib/supabase/admin";
import { ServiceError } from "@/lib/services/agents";
export type OutboxEvent = { id: number; type: string; actor_id: string | null; payload: Record<string, unknown>; created_at: string };
export async function listEventsAfter(actorId: string, opts: { after?: number; types?: string[]; limit?: number } = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500); let q = createAdminClient().from("events").select("id,type,actor_id,payload,created_at").gt("id", Math.max(opts.after ?? 0, 0)).or(`recipient_actor_id.eq.${actorId},recipient_actor_id.is.null`).order("id").limit(limit);
  if (opts.types?.length) q = q.in("type", opts.types.slice(0, 20)); const { data, error } = await q; if (error) throw new ServiceError(500, error.message); const rows = (data ?? []) as OutboxEvent[]; return { data: rows, next_cursor: rows.at(-1)?.id ?? opts.after ?? null };
}
