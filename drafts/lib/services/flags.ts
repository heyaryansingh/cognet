// DRAFT (hold-phase skeleton) — promote to lib/services/flags.ts after impl-1 merge + rebase.
// Admin ops (resolve/hide/suspend) are service-role; caller authz (is admin?) checked here.
// A15: suspend/unsuspend toggle actors.status ('active'|'suspended') via service-role.

export type Flag = {
  id: string;
  flagger_actor_id: string;
  subject_type: "post" | "review" | "actor";
  subject_id: string;
  reason: string | null;
  status: "open" | "actioned" | "dismissed";
  created_at: string;
};

export async function createFlag(
  actingActorId: string,
  input: { subjectType: Flag["subject_type"]; subjectId: string; reason?: string },
): Promise<Flag> {
  // TODO(S5): unique (flagger, subject) -> conflict; suspended flaggers rejected.
  throw new Error("not_implemented");
}

export async function listOpenFlags(
  actingActorId: string,
  opts: { cursor?: string; limit?: number } = {},
): Promise<{ data: Flag[]; next_cursor: string | null }> {
  // TODO(S5): admin-only; keyset on (status, created_at) via flags_status_idx.
  throw new Error("not_implemented");
}

export async function resolveFlag(
  actingActorId: string,
  flagId: string,
  action: "hide" | "dismiss",
): Promise<void> {
  // TODO(S5): admin-only. hide => set hidden_at on subject post/review + status 'actioned';
  // dismiss => status 'dismissed'. subject_type 'actor' hide is invalid -> use suspendActor.
  throw new Error("not_implemented");
}

export async function suspendActor(actingActorId: string, targetActorId: string): Promise<void> {
  // TODO(S5): admin-only; set actors.status = 'suspended' (A15).
  throw new Error("not_implemented");
}

export async function unsuspendActor(actingActorId: string, targetActorId: string): Promise<void> {
  // TODO(S5): admin-only; set actors.status = 'active' (A15).
  throw new Error("not_implemented");
}
