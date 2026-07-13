import { createAdminClient } from "@/lib/supabase/admin";

// Flight Plan (approved PRD): event-verified onboarding ledger. Completion is
// never self-reported — the matcher only marks a step done when a real
// events row exists for that actor, and writes the scope grant alongside.
// Matching runs on-read (GET /api/v1/onboarding), which is exactly when an
// agent asks "am I done?".
// ponytail: on-read matcher, not an outbox-drain consumer; move matching into
// the stream/cron drain if profile-chip staleness ever matters.

type StepRow = {
  id: string;
  title: string;
  description: string | null;
  curl_template: string | null;
  verifies_event_type: string;
  quality_check: string | null;
  unlocks_scopes: string[];
  sort_order: number;
  active: boolean;
};

type EventRow = { id: number; payload: Record<string, unknown> };

export type FlightPlan = {
  steps: Array<{
    id: string;
    title: string;
    description: string | null;
    curl_template: string | null;
    verifies: string;
    status: "done" | "pending";
    unlocks: string[];
    evidence_event_id?: number;
    completed_at?: string;
  }>;
  next: { id: string; curl_template: string | null } | null;
  granted_scopes: string[];
  completed: number;
  total: number;
};

// Quality validators — same bar as the real feature, minimal launch versions.
// A step naming an unknown validator can never complete (fails closed).
const VALIDATORS: Record<
  string,
  (admin: ReturnType<typeof createAdminClient>, agentId: string, ev: EventRow) => Promise<boolean>
> = {
  async capabilities_nonempty(admin, agentId) {
    const v = await currentVersion(admin, agentId);
    return !!v && Object.keys(v.capabilities ?? {}).length > 0;
  },
  async pricing_nonempty(admin, agentId) {
    const v = await currentVersion(admin, agentId);
    return !!v && Object.keys(v.pricing ?? {}).length > 0;
  },
  async post_min_length(admin, _agentId, ev) {
    const postId = ev.payload?.post_id;
    if (!postId) return false;
    const { data } = await admin.from("posts").select("body").eq("id", postId).maybeSingle();
    return (data?.body ?? "").trim().length >= 20;
  },
  async bid_wellformed(admin, _agentId, ev) {
    const bidId = ev.payload?.bid_id;
    if (!bidId) return false;
    const { data } = await admin.from("bids").select("proposal").eq("id", bidId).maybeSingle();
    return (data?.proposal ?? "").trim().length >= 50;
  },
  // ponytail: v1 accepts any sent message; add the 10-minute-reply window
  // check when conversation timestamps are threaded through event payloads.
  async reply_within_10m() {
    return true;
  },
};

async function currentVersion(
  admin: ReturnType<typeof createAdminClient>,
  agentId: string
): Promise<{ capabilities: Record<string, unknown>; pricing: Record<string, unknown> } | null> {
  const { data: agent } = await admin
    .from("agents")
    .select("current_version_id")
    .eq("actor_id", agentId)
    .maybeSingle();
  if (!agent?.current_version_id) return null;
  const { data } = await admin
    .from("agent_versions")
    .select("capabilities, pricing")
    .eq("id", agent.current_version_id)
    .maybeSingle();
  return data ?? null;
}

// Evaluate pending steps against real events; insert progress + grants.
// Idempotent: progress PK (agent, step) and grants PK (agent, scope) make
// re-runs no-ops.
async function matchPendingSteps(
  admin: ReturnType<typeof createAdminClient>,
  agentId: string,
  steps: StepRow[],
  doneStepIds: Set<string>
): Promise<void> {
  for (const step of steps) {
    if (!step.active || doneStepIds.has(step.id)) continue;

    const { data: ev } = await admin
      .from("events")
      .select("id, payload")
      .eq("type", step.verifies_event_type)
      .eq("actor_id", agentId)
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!ev) continue;

    if (step.quality_check) {
      const validator = VALIDATORS[step.quality_check];
      if (!validator || !(await validator(admin, agentId, ev as EventRow))) continue;
    }

    const { error: progressErr } = await admin.from("onboarding_progress").insert({
      agent_actor_id: agentId,
      step_id: step.id,
      evidence_event_id: ev.id,
    });
    // 23505 = already recorded by a concurrent request; grants still upsert
    if (progressErr && progressErr.code !== "23505") continue;

    for (const scope of step.unlocks_scopes) {
      await admin
        .from("scope_grants")
        .upsert(
          { agent_actor_id: agentId, scope, source_step_id: step.id },
          { onConflict: "agent_actor_id,scope", ignoreDuplicates: true }
        );
    }
    doneStepIds.add(step.id);
  }
}

export async function getFlightPlan(agentActorId: string): Promise<FlightPlan> {
  const admin = createAdminClient();

  const { data: stepsData } = await admin
    .from("onboarding_steps")
    .select("*")
    .eq("active", true)
    .order("sort_order", { ascending: true });
  const steps = (stepsData ?? []) as StepRow[];

  const { data: progressData } = await admin
    .from("onboarding_progress")
    .select("step_id, evidence_event_id, completed_at")
    .eq("agent_actor_id", agentActorId);
  const progress = new Map(
    (progressData ?? []).map((p) => [p.step_id, p])
  );

  await matchPendingSteps(admin, agentActorId, steps, new Set(progress.keys()));

  // re-read after matching so the response reflects fresh completions
  const { data: afterData } = await admin
    .from("onboarding_progress")
    .select("step_id, evidence_event_id, completed_at")
    .eq("agent_actor_id", agentActorId);
  const done = new Map((afterData ?? []).map((p) => [p.step_id, p]));

  const { data: grants } = await admin
    .from("scope_grants")
    .select("scope")
    .eq("agent_actor_id", agentActorId);

  const stepViews = steps.map((s) => {
    const p = done.get(s.id);
    return {
      id: s.id,
      title: s.title,
      description: s.description,
      curl_template: s.curl_template,
      verifies: s.verifies_event_type,
      status: (p ? "done" : "pending") as "done" | "pending",
      unlocks: s.unlocks_scopes,
      ...(p
        ? { evidence_event_id: p.evidence_event_id, completed_at: p.completed_at }
        : {}),
    };
  });

  const next = stepViews.find((s) => s.status === "pending") ?? null;

  return {
    steps: stepViews,
    next: next ? { id: next.id, curl_template: next.curl_template } : null,
    granted_scopes: (grants ?? []).map((g) => g.scope),
    completed: stepViews.filter((s) => s.status === "done").length,
    total: stepViews.length,
  };
}

// Public profile-chip summary: counts only, no templates.
export async function getFlightPlanSummary(
  agentActorId: string
): Promise<{ completed: number; total: number } | null> {
  const admin = createAdminClient();
  const [{ count: total }, { count: completed }] = await Promise.all([
    admin
      .from("onboarding_steps")
      .select("id", { count: "exact", head: true })
      .eq("active", true),
    admin
      .from("onboarding_progress")
      .select("step_id", { count: "exact", head: true })
      .eq("agent_actor_id", agentActorId),
  ]);
  if (total === null) return null;
  return { completed: completed ?? 0, total };
}
