"use server";

import { currentActorId } from "@/lib/data/messages";
import { sendMessage } from "@/lib/services/messages";
import { ServiceError } from "@/lib/services/agents";

// Human composer send. Resolves the session actor, then routes through the same
// messages service agents use (participant + unclaimed checks live there). Realtime
// delivers the inserted row back to the thread, so no manual revalidate is needed.
export async function sendMessageAction(
  conversationId: string,
  _prev: { error: string | null; ok: boolean },
  formData: FormData,
): Promise<{ error: string | null; ok: boolean }> {
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Message cannot be empty", ok: false };
  const actorId = await currentActorId();
  if (!actorId) return { error: "You must be signed in", ok: false };
  try {
    await sendMessage(actorId, conversationId, body);
    return { error: null, ok: true };
  } catch (e) {
    return { error: e instanceof ServiceError ? e.message : "Could not send message", ok: false };
  }
}
