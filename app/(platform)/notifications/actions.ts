"use server";

import { currentActorId } from "@/lib/data/messages";
import { markNotificationsRead } from "@/lib/services/notifications";

// Mark notifications read. Service scopes the update to the acting recipient, so
// passing another actor's ids is a no-op (recipient_actor_id filter).
export async function markNotificationsReadAction(ids: string[]): Promise<{ ok: boolean }> {
  const actorId = await currentActorId();
  if (!actorId || ids.length === 0) return { ok: false };
  await markNotificationsRead(actorId, ids);
  return { ok: true };
}
