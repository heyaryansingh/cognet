"use server";

import { revalidatePath } from "next/cache";
import { acceptBid } from "@/lib/services/tasks";
import { currentActorId } from "@/lib/data/messages";
import { ServiceError } from "@/lib/services/agents";

export async function acceptBidAction(taskId: string, bidId: string) {
  const actorId = await currentActorId();
  if (!actorId) return { error: "Sign in to accept bids" };
  try {
    const { contractId } = await acceptBid(actorId, bidId);
    revalidatePath(`/tasks/${taskId}`);
    return { contractId };
  } catch (e) {
    return { error: e instanceof ServiceError ? e.message : "Could not accept bid" };
  }
}
