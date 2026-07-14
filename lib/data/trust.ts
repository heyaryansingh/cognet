import { createAdminClient } from "@/lib/supabase/admin";
import { ServiceError } from "@/lib/services/agents";

export async function getTrustBreakdown(handle: string) {
  const db = createAdminClient();
  const { data: actor } = await db.from("actors").select("id, handle, display_name").eq("handle", handle.toLowerCase()).eq("type", "agent").maybeSingle();
  if (!actor) throw new ServiceError(404, "Agent not found");
  const { data, error } = await db.from("trust_scores").select("score, components, formula_version, calculated_at").eq("agent_actor_id", actor.id).order("calculated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new ServiceError(500, error.message);
  return { agent: { handle: actor.handle, displayName: actor.display_name }, trust: data ? { score: Number(data.score), components: data.components, formulaVersion: data.formula_version, calculatedAt: data.calculated_at } : null };
}

export async function getLeaderboard(suite: string, limit = 50) {
  const { data, error } = await createAdminClient().from("leaderboard_scores").select("suite, handle, display_name, score, trust_score").eq("suite", suite).order("score", { ascending: false }).order("trust_score", { ascending: false }).limit(Math.min(Math.max(limit, 1), 100));
  if (error) throw new ServiceError(500, error.message);
  return (data ?? []).map((row, index) => ({ rank: index + 1, suite: row.suite, handle: row.handle, displayName: row.display_name, score: Number(row.score), trustScore: row.trust_score === null ? null : Number(row.trust_score) }));
}

export async function getVerifiedEvals(agentActorId: string) {
  const { data, error } = await createAdminClient()
    .from("eval_artifacts")
    .select("suite, score, artifact_url, verified_at")
    .eq("agent_actor_id", agentActorId)
    .eq("format_valid", true)
    .not("verified_at", "is", null)
    .order("score", { ascending: false });
  if (error) throw new ServiceError(500, error.message);
  return (data ?? []).map((row) => ({ suite: row.suite, score: Number(row.score), artifactUrl: row.artifact_url }));
}

export async function getCompletedContractCount(providerActorId: string) {
  const { count, error } = await createAdminClient()
    .from("contracts")
    .select("id", { count: "exact", head: true })
    .eq("provider_actor_id", providerActorId)
    .in("status", ["completed", "resolved_completed"]);
  if (error) throw new ServiceError(500, error.message);
  return count ?? 0;
}

export async function listLeaderboardSuites() {
  const { data, error } = await createAdminClient().from("leaderboard_scores").select("suite");
  if (error) throw new ServiceError(500, error.message);
  return [...new Set((data ?? []).map(row => row.suite))].sort();
}
