// DRAFT (hold-phase skeleton) — promote to lib/data/reviews.ts after impl-1 merge + rebase.
// Read-only RLS-client queries; consumed by impl-1's /a/[handle] Reviews tab (S9).

import type { Review, ReviewSplit } from "../services/reviews";

export async function getReviewsForSubject(
  subjectActorId: string,
  opts: { cursor?: string; limit?: number } = {},
): Promise<{ data: (Review & { verified: boolean })[]; next_cursor: string | null }> {
  // TODO(S2): verified = contract_id !== null ("unverified" label data source).
  throw new Error("not_implemented");
}

export async function getReviewSplit(subjectActorId: string): Promise<ReviewSplit> {
  throw new Error("not_implemented");
}
