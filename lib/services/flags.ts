import { createAdminClient } from "@/lib/supabase/admin";
import { ServiceError } from "@/lib/services/agents";

export async function createFlag(actorId: string, input: { subjectType: "post" | "review" | "actor"; subjectId: string; reason: string }) { const reason = input.reason?.trim(); if (!reason || reason.length > 1000) throw new ServiceError(400, "reason must be 1-1000 characters"); const { error } = await createAdminClient().from("flags").insert({ flagger_actor_id: actorId, subject_type: input.subjectType, subject_id: input.subjectId, reason }); if (error) throw new ServiceError(error.code === "23505" ? 409 : 500, error.message); }

// Admin authz (director ruling R2): comma-separated handle allowlist in ADMIN_HANDLES.
export async function assertAdmin(actorId: string) {
  const allowed = (process.env.ADMIN_HANDLES ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (!allowed.length) throw new ServiceError(403, "Admin access is not configured");
  const { data } = await createAdminClient().from("actors").select("handle").eq("id", actorId).maybeSingle();
  if (!data || !allowed.includes(String(data.handle).toLowerCase())) throw new ServiceError(403, "Admin access required");
}

export async function listOpenFlags(actorId: string) {
  await assertAdmin(actorId);
  const { data, error } = await createAdminClient()
    .from("flags")
    .select("id, subject_type, subject_id, reason, status, created_at, actors!flags_flagger_actor_id_fkey(handle, display_name)")
    .eq("status", "open")
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw new ServiceError(500, error.message);
  return data ?? [];
}

const VALID_ACTIONS: Record<string, string[]> = { post: ["hide", "unhide"], review: ["hide", "unhide"], actor: ["suspend", "unsuspend"] };

export async function moderateSubject(actorId: string, input: { subjectType: "post" | "review" | "actor"; subjectId: string; action: "hide" | "unhide" | "suspend" | "unsuspend"; flagId?: string }) {
  await assertAdmin(actorId);
  if (!VALID_ACTIONS[input.subjectType]?.includes(input.action)) throw new ServiceError(400, `Cannot ${input.action} a ${input.subjectType}`);
  const admin = createAdminClient();
  const table = input.subjectType === "actor" ? "actors" : `${input.subjectType}s`;
  const patch = input.subjectType === "actor" ? { status: input.action === "suspend" ? "suspended" : "active" } : { hidden_at: input.action === "hide" ? new Date().toISOString() : null };
  const { error } = await admin.from(table).update(patch).eq("id", input.subjectId);
  if (error) throw new ServiceError(500, error.message);
  if (input.flagId) {
    const { error: flagErr } = await admin.from("flags").update({ status: "resolved" }).eq("id", input.flagId);
    if (flagErr) throw new ServiceError(500, flagErr.message);
  }
}

export async function dismissFlag(actorId: string, flagId: string) {
  await assertAdmin(actorId);
  const { error } = await createAdminClient().from("flags").update({ status: "dismissed" }).eq("id", flagId);
  if (error) throw new ServiceError(500, error.message);
}
