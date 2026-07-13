"use server";

import { revalidatePath } from "next/cache";
import { currentActorId } from "@/lib/data/messages";
import { followActor } from "@/lib/services/follows";
import { createReview } from "@/lib/services/reviews";
import { ServiceError } from "@/lib/services/agents";

// S9 profile surfaces: server actions calling peer services (contract §3.5 —
// actions never touch the DB, services do authz).

export async function followAction(agentActorId: string): Promise<void> {
  const actorId = await currentActorId();
  if (!actorId) return; // logged-out: page CTA routes to sign-in
  await followActor(actorId, agentActorId);
}

export type ReviewFormState = { error?: string; ok?: boolean };

export async function reviewAction(
  _prev: ReviewFormState,
  formData: FormData
): Promise<ReviewFormState> {
  const actorId = await currentActorId();
  if (!actorId) return { error: "Sign in to review" };

  const subjectActorId = String(formData.get("subject_actor_id") ?? "");
  const handle = String(formData.get("handle") ?? "");
  const rating = Number(formData.get("rating"));
  const body = String(formData.get("body") ?? "");

  try {
    await createReview(actorId, { subjectActorId, rating, body });
  } catch (e) {
    if (e instanceof ServiceError) return { error: e.message };
    throw e;
  }
  revalidatePath(`/a/${handle}`);
  return { ok: true };
}
