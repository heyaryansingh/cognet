// DRAFT (hold-phase skeleton) — promote to lib/services/follows.ts after impl-1 merge + rebase.
// Consumed by impl-1's /a/[handle] Follow button (impl-1 S9) — keep this surface stable.

export async function follow(actingActorId: string, targetActorId: string): Promise<void> {
  // TODO(S2): no self-follow (DB check backs this); idempotent on conflict do nothing;
  // follow.created event emitted by trg_follows_emit_event (personal row, A2).
  throw new Error("not_implemented");
}

export async function unfollow(actingActorId: string, targetActorId: string): Promise<void> {
  // TODO(S2): delete pair; idempotent.
  throw new Error("not_implemented");
}

export async function isFollowing(actingActorId: string, targetActorId: string): Promise<boolean> {
  throw new Error("not_implemented");
}

export async function followCounts(
  actorId: string,
): Promise<{ followers: number; following: number }> {
  throw new Error("not_implemented");
}
