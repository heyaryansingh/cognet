import { createAdminClient } from "@/lib/supabase/admin";

export const TRUST_FORMULA_VERSION = "v1";
export type TrustInputs = { completedContracts: number; disputedContracts: number; reviewRows: Array<{ rating: number; reviewerType: "human" | "agent" | "org"; verifiedHire: boolean }>; endorsementTrusts: number[]; evalRows: Array<{ suite: string; score: number; verified: boolean }>; orgVerified: boolean; uptimePercent: number };
export type TrustBreakdown = { task_history: number; reviews: number; endorsements: number; evals: number; org_verification: number; uptime: number; score: number; formula_version: string };
const clamp = (n: number) => Math.max(0, Math.min(1, n));

export function calculateTrust(input: TrustInputs): TrustBreakdown {
  const task_history = clamp(Math.log1p(Math.max(0, input.completedContracts)) / Math.log(21) - Math.min(0.5, Math.max(0, input.disputedContracts) * 0.1));
  const weightedReviews = input.reviewRows.reduce((acc, r) => { const weight = (r.reviewerType === "agent" ? 0.5 : 1) * (r.verifiedHire ? 1.25 : 1); return { sum: acc.sum + r.rating * weight, weight: acc.weight + weight }; }, { sum: 0, weight: 0 });
  const reviews = clamp(((3.5 * 5 + weightedReviews.sum) / (5 + weightedReviews.weight)) / 5);
  const endorsements = input.endorsementTrusts.length ? clamp(input.endorsementTrusts.reduce((a, n) => a + clamp(n / 100), 0) / input.endorsementTrusts.length) : 0;
  const suites = new Map<string, number>();
  for (const row of input.evalRows) suites.set(row.suite, Math.max(suites.get(row.suite) ?? 0, clamp(row.score / 100) * (row.verified ? 1 : 0.3)));
  const evals = suites.size ? [...suites.values()].reduce((a, n) => a + n, 0) / suites.size : 0;
  const org_verification = input.orgVerified ? 1 : 0;
  const uptime = clamp(input.uptimePercent / 100);
  const score = Number((100 * (task_history * .30 + reviews * .25 + endorsements * .15 + evals * .15 + org_verification * .10 + uptime * .05)).toFixed(2));
  return { task_history, reviews, endorsements, evals, org_verification, uptime, score, formula_version: TRUST_FORMULA_VERSION };
}

export async function rollupDailyStats(day = new Date(Date.now() - 86400000)) {
  const db = createAdminClient(); const start = new Date(day); start.setUTCHours(0, 0, 0, 0); const end = new Date(start.getTime() + 86400000); const dayKey = start.toISOString().slice(0, 10);
  const { data: rows, error } = await db.from("agent_heartbeats").select("agent_actor_id, latency_ms").gte("observed_at", start.toISOString()).lt("observed_at", end.toISOString()); if (error) throw error;
  const groups = new Map<string, { count: number; latencies: number[] }>();
  for (const row of rows ?? []) { const entry = groups.get(row.agent_actor_id) ?? { count: 0, latencies: [] }; entry.count++; if (row.latency_ms !== null) entry.latencies.push(row.latency_ms); groups.set(row.agent_actor_id, entry); }
  for (const [agentId, entry] of groups) { const average = entry.latencies.length ? entry.latencies.reduce((a, n) => a + n, 0) / entry.latencies.length : null; await db.from("agent_stats_daily").upsert({ agent_actor_id: agentId, day: dayKey, heartbeat_count: entry.count, uptime_percent: Math.min(100, entry.count * 100), avg_latency_ms: average }, { onConflict: "agent_actor_id,day" }); }
  return { day: dayKey, agents: groups.size };
}

export async function refreshTrustScores() {
  const db = createAdminClient(); const { data: agents, error } = await db.from("agents").select("actor_id, creator_actor_id"); if (error) throw error;
  const previousDay = new Date(Date.now() - 86400000).toISOString(); let updated = 0;
  for (const agent of agents ?? []) {
    const [{ data: contracts }, { data: reviews }, { data: endorsements }, { data: evals }, { data: stats }, { data: orgVerification }] = await Promise.all([
      db.from("contracts").select("status").or(`client_actor_id.eq.${agent.actor_id},provider_actor_id.eq.${agent.actor_id}`),
      db.from("reviews").select("rating, contract_id, actors!reviews_reviewer_actor_id_fkey(type)").eq("subject_actor_id", agent.actor_id).is("hidden_at", null),
      db.from("endorsements").select("endorser_actor_id").eq("endorsed_actor_id", agent.actor_id),
      db.from("eval_artifacts").select("suite, score, verified_at").eq("agent_actor_id", agent.actor_id).eq("format_valid", true),
      db.from("agent_stats_daily").select("uptime_percent").eq("agent_actor_id", agent.actor_id).order("day", { ascending: false }).limit(30),
      agent.creator_actor_id ? db.from("org_verifications").select("id").eq("org_actor_id", agent.creator_actor_id).eq("status", "verified").limit(1) : Promise.resolve({ data: [] as unknown[] }),
    ]);
    const endorserIds = (endorsements ?? []).map(e => e.endorser_actor_id); const endorserScores = new Map<string, number>();
    if (endorserIds.length) { const { data } = await db.from("trust_scores").select("agent_actor_id, score").in("agent_actor_id", endorserIds).lt("calculated_at", previousDay).order("calculated_at", { ascending: false }); for (const row of data ?? []) if (!endorserScores.has(row.agent_actor_id)) endorserScores.set(row.agent_actor_id, Number(row.score)); }
    const breakdown = calculateTrust({ completedContracts: (contracts ?? []).filter(c => ["completed", "resolved_completed"].includes(c.status)).length, disputedContracts: (contracts ?? []).filter(c => c.status === "disputed" || c.status === "resolved_cancelled").length, reviewRows: (reviews ?? []).map(r => ({ rating: r.rating, reviewerType: ((r.actors as unknown as { type?: "human" | "agent" | "org" } | null)?.type ?? "human"), verifiedHire: !!r.contract_id })), endorsementTrusts: endorserIds.map(id => endorserScores.get(id) ?? 0), evalRows: (evals ?? []).map(e => ({ suite: e.suite, score: Number(e.score), verified: !!e.verified_at })), orgVerified: !!orgVerification?.length, uptimePercent: (stats ?? []).length ? (stats ?? []).reduce((sum, s) => sum + Number(s.uptime_percent), 0) / (stats ?? []).length : 0 });
    const { error: insertError } = await db.from("trust_scores").insert({ agent_actor_id: agent.actor_id, score: breakdown.score, components: breakdown, formula_version: TRUST_FORMULA_VERSION }); if (insertError) throw insertError;
    const { error: updateError } = await db.from("agents").update({ trust_score: breakdown.score }).eq("actor_id", agent.actor_id); if (updateError) throw updateError; updated++;
  }
  return { updated, formulaVersion: TRUST_FORMULA_VERSION };
}
