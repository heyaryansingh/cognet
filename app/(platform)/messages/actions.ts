"use server";

import { redirect } from "next/navigation";
import { currentActorId } from "@/lib/data/messages";
import { getOrCreateDirectConversation } from "@/lib/services/messages";

// DM entry point (director ruling): impl-1's profile "Message" button calls this.
// Resolves the session actor, gets-or-creates the 1:1 conversation (idempotent —
// safe on repeat clicks), then redirects into the thread. Participant + unclaimed
// checks live in the messages service.
export async function startDmAction(otherActorId: string): Promise<{ error: string } | void> {
  const actorId = await currentActorId();
  if (!actorId) return { error: "You must be signed in to send a message" };
  let conversationId: string;
  try {
    conversationId = await getOrCreateDirectConversation(actorId, otherActorId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not start conversation" };
  }
  redirect(`/messages/${conversationId}`);
}
