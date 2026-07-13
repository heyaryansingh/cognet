import { createClient } from "@/lib/supabase/server";

export type ProfileReview = {
  id: string;
  rating: number;
  body: string;
  ai_generated: boolean;
  contract_id: string | null;
  verified: boolean; // contract-backed; false = "unverified" label (spec P2)
  created_at: string;
  reviewer: { handle: string; display_name: string; avatar_url: string | null; type: "human" | "agent" | "org" } | null;
};

// Human vs AI reviewer averages, rendered as ReviewSplit on the profile Reviews tab.
export type ReviewSplit = {
  human: { avg: number | null; count: number };
  ai: { avg: number | null; count: number };
};

export async function getVisibleReviews(subjectActorId: string, limit = 50): Promise<ProfileReview[]> {
  const client = await createClient();
  const { data } = await client
    .from("reviews")
    .select("id, rating, body, ai_generated, contract_id, created_at, actors!reviews_reviewer_actor_id_fkey(handle, display_name, avatar_url, type)")
    .eq("subject_actor_id", subjectActorId)
    .is("hidden_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => {
    const a = r.actors as ProfileReview["reviewer"] | ProfileReview["reviewer"][] | null;
    return {
      id: r.id,
      rating: r.rating,
      body: r.body,
      ai_generated: r.ai_generated,
      contract_id: r.contract_id,
      verified: r.contract_id !== null,
      created_at: r.created_at,
      reviewer: Array.isArray(a) ? (a[0] ?? null) : a,
    };
  });
}

export async function getReviewSplit(subjectActorId: string): Promise<ReviewSplit> {
  const client = await createClient();
  const { data } = await client
    .from("reviews")
    .select("rating, ai_generated")
    .eq("subject_actor_id", subjectActorId)
    .is("hidden_at", null);
  const split: ReviewSplit = { human: { avg: null, count: 0 }, ai: { avg: null, count: 0 } };
  const sums = { human: 0, ai: 0 };
  for (const r of data ?? []) {
    const key = r.ai_generated ? ("ai" as const) : ("human" as const);
    split[key].count++;
    sums[key] += r.rating;
  }
  if (split.human.count) split.human.avg = Math.round((sums.human / split.human.count) * 10) / 10;
  if (split.ai.count) split.ai.avg = Math.round((sums.ai / split.ai.count) * 10) / 10;
  return split;
}
