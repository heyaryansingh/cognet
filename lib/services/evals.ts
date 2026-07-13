import { createAdminClient } from "@/lib/supabase/admin";
import { ServiceError } from "@/lib/services/agents";

export type EvalArtifactInput = { suite: string; score: number; artifactUrl: string; payload?: Record<string, unknown>; agentVersionId?: string };

// v1 deliberately validates a portable minimum. Suite-specific schemas can be
// added as a registry once Cognet supports more than the declared suites.
export function validateEvalArtifact(input: EvalArtifactInput) {
  if (!input.suite?.trim() || input.suite.trim().length > 100) throw new ServiceError(422, "suite must be 2-100 characters");
  if (!Number.isFinite(input.score) || input.score < 0 || input.score > 100) throw new ServiceError(422, "score must be 0-100");
  try { const url = new URL(input.artifactUrl); if (!/^https?:$/.test(url.protocol)) throw new Error(); } catch { throw new ServiceError(422, "artifactUrl must be an http(s) URL"); }
  if (input.payload !== undefined && (!input.payload || Array.isArray(input.payload))) throw new ServiceError(422, "payload must be an object");
}

export async function submitEvalArtifact(actingActorId: string, input: EvalArtifactInput) {
  validateEvalArtifact(input);
  const db = createAdminClient();
  const { data: agent } = await db.from("agents").select("actor_id, creator_actor_id").eq("actor_id", actingActorId).maybeSingle();
  if (!agent) throw new ServiceError(403, "Only an agent may submit its evaluation artifact");
  if (input.agentVersionId) {
    const { data: version } = await db.from("agent_versions").select("id").eq("id", input.agentVersionId).eq("agent_actor_id", actingActorId).maybeSingle();
    if (!version) throw new ServiceError(422, "agentVersionId does not belong to this agent");
  }
  const { data, error } = await db.from("eval_artifacts").insert({ agent_actor_id: actingActorId, agent_version_id: input.agentVersionId ?? null, suite: input.suite.trim(), score: input.score, artifact_url: input.artifactUrl, payload: input.payload ?? {}, format_valid: true }).select().single();
  if (error || !data) throw new ServiceError(500, error?.message ?? "Could not submit artifact");
  return data;
}

export async function verifyEvalArtifact(actingActorId: string, artifactId: string, verified: boolean) {
  const db = createAdminClient();
  const { data: actor } = await db.from("actors").select("type").eq("id", actingActorId).maybeSingle();
  if (actor?.type !== "org") throw new ServiceError(403, "Only an organization reviewer may verify artifacts");
  const { data, error } = await db.from("eval_artifacts").update(verified ? { verified_at: new Date().toISOString(), verified_by_actor_id: actingActorId } : { verified_at: null, verified_by_actor_id: null }).eq("id", artifactId).select().maybeSingle();
  if (error) throw new ServiceError(500, error.message); if (!data) throw new ServiceError(404, "Artifact not found"); return data;
}

export async function recordHeartbeat(actingActorId: string, latencyMs?: number) {
  if (latencyMs !== undefined && (!Number.isInteger(latencyMs) || latencyMs < 0)) throw new ServiceError(422, "latencyMs must be a non-negative integer");
  const { error } = await createAdminClient().from("agent_heartbeats").insert({ agent_actor_id: actingActorId, latency_ms: latencyMs ?? null });
  if (error) throw new ServiceError(500, error.message);
}
