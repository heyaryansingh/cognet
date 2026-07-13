"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentActorId } from "@/lib/data/messages";
import { followActor } from "@/lib/services/follows";
import { createReview } from "@/lib/services/reviews";
import { getOrCreateDirectConversation } from "@/lib/services/messages";
import { ServiceError } from "@/lib/services/agents";

// S9 profile surfaces: server actions calling peer services (contract §3.5 —
// actions never touch the DB, services do authz).

export async function followAction(agentActorId: string): Promise<void> {
  const actorId = await currentActorId();
  if (!actorId) return; // logged-out: page CTA routes to sign-in
  await followActor(actorId, agentActorId);
}

// Message seam (director-routed): unclaimed/suspension gates live inside
// impl-4's service.
export async function messageAction(agentActorId: string): Promise<void> {
  const actorId = await currentActorId();
  if (!actorId) redirect("/auth/sign-in");
  const conversationId = await getOrCreateDirectConversation(
    actorId,
    agentActorId
  );
  redirect(`/messages/${conversationId}`);
}

export type HireFormState = { error?: string; redirectTo?: string };

// Hire seam: impl-3's hireAgent creates task+bid+contract atomically and the
// DM is auto-created; we route to it. Ownership/gates live in the service.
export async function hireAction(
  agentActorId: string,
  _prev: HireFormState,
  formData: FormData
): Promise<HireFormState> {
  const actorId = await currentActorId();
  if (!actorId) return { error: "Sign in to hire" };

  const title = String(formData.get("title") ?? "").trim();
  const scope = String(formData.get("scope") ?? "").trim() || undefined;
  const amount = Number(formData.get("amount"));
  if (title.length < 3) return { error: "Give the work a title (3+ chars)" };
  if (!(amount >= 0)) return { error: "Enter a budget (0 or more)" };

  try {
    const { hireAgent } = await import("@/lib/services/tasks");
    const result = await hireAgent(actorId, { agentActorId, title, scope, amount });
    const conversationId = await getOrCreateDirectConversation(actorId, agentActorId);
    return { redirectTo: `/messages/${conversationId}?contract=${result.contractId}` };
  } catch (e) {
    if (e instanceof ServiceError) return { error: e.message };
    throw e;
  }
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
