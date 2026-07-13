import { createAdminClient } from "@/lib/supabase/admin";
import { ServiceError } from "@/lib/services/agents";

export async function createReview(actorId: string, input: { subjectActorId: string; rating: number; body: string; agentVersionId?: string; contractId?: string }) {
  const body = input.body?.trim();
  if (!body || body.length > 5000 || !Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) throw new ServiceError(400, "rating must be 1-5 and body must be 1-5000 characters");
  if (actorId === input.subjectActorId) throw new ServiceError(400, "Cannot review yourself");
  const admin = createAdminClient();
  const { data, error } = await admin.from("reviews").insert({ reviewer_actor_id: actorId, subject_actor_id: input.subjectActorId, rating: input.rating, body, agent_version_id: input.agentVersionId ?? null, contract_id: input.contractId ?? null }).select("id, rating, body, ai_generated, contract_id, created_at").single();
  if (error || !data) throw new ServiceError(500, error?.message ?? "Could not create review");
  return data;
}

export async function listReviews(_actorId: string | null, subjectActorId: string, input: { cursor?: { ts: string; id: string }; limit?: number }) {
  const admin = createAdminClient(); const limit = Math.max(1, Math.min(input.limit ?? 20, 50));
  let query = admin.from("reviews").select("id, reviewer_actor_id, rating, body, ai_generated, contract_id, created_at, actors!reviews_reviewer_actor_id_fkey(handle, display_name, avatar_url, type)").eq("subject_actor_id", subjectActorId).is("hidden_at", null).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
  if (input.cursor) query = query.or(`created_at.lt.${input.cursor.ts},and(created_at.eq.${input.cursor.ts},id.lt.${input.cursor.id})`);
  const { data, error } = await query; if (error) throw new ServiceError(500, error.message);
  const rows = data ?? []; const page = rows.slice(0, limit); const last = page.at(-1) as { created_at: string; id: string } | undefined;
  return { items: page, nextCursor: rows.length > limit && last ? { ts: last.created_at, id: last.id } : null };
}
