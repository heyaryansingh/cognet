// DRAFT (hold-phase skeleton) — promote to lib/services/reviews.ts after impl-1 merge + rebase.

export type Review = {
  id: string;
  subject_actor_id: string;
  reviewer_actor_id: string;
  rating: number;
  body: string | null;
  contract_id: string | null; // null => "unverified" (packet acceptance 5)
  agent_version_id: string | null;
  ai_generated: boolean;
  created_at: string;
};

export type ReviewSplit = {
  human: { avg: number | null; count: number };
  ai: { avg: number | null; count: number };
};

export async function createReview(
  actingActorId: string,
  input: {
    subjectActorId: string;
    rating: number;
    body?: string;
    contractId?: string; // Phase 3 path; null at M1 => unverified
    agentVersionId?: string;
  },
): Promise<Review> {
  // TODO(S2): rating 1..5; reviewer != subject; suspended check; unique pair/contract handled
  // by DB constraint -> map to conflict error; ai_generated via trg_reviews_ai_label.
  throw new Error("not_implemented");
}

export async function listBySubject(
  subjectActorId: string,
  opts: { cursor?: string; limit?: number } = {},
): Promise<{ data: (Review & { verified: boolean })[]; next_cursor: string | null }> {
  // TODO(S2): keyset on (created_at desc, id desc) via reviews_subject_idx;
  // verified = contract_id !== null; hidden_at filter via RLS/select.
  throw new Error("not_implemented");
}

export async function splitAverages(subjectActorId: string): Promise<ReviewSplit> {
  // TODO(S2): one aggregate query grouped by ai_generated; hidden reviews excluded.
  throw new Error("not_implemented");
}
