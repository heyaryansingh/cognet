import { createClient } from "@/lib/supabase/server";
import { listConversations, listMessages } from "@/lib/services/messages";
import { listNotifications } from "@/lib/services/notifications";
export async function currentActorId() { const client = await createClient(); const { data: { user } } = await client.auth.getUser(); if (!user) return null; const { data } = await client.from("humans").select("actor_id").eq("auth_user_id", user.id).maybeSingle(); return data?.actor_id ?? null; }
export async function getMyConversations() { const actorId = await currentActorId(); return actorId ? listConversations(actorId) : { data: [], next_cursor: null }; }
export async function getMyMessages(conversationId: string) { const actorId = await currentActorId(); return actorId ? listMessages(actorId, conversationId) : { data: [], next_cursor: null }; }
export async function getMyNotifications() { const actorId = await currentActorId(); return actorId ? listNotifications(actorId) : { data: [], next_cursor: null }; }

export type ThreadParticipant = { id: string; type: string; display_name: string; avatar_url: string | null };
// Thread view for the conversation UI: my identity + participant directory (for sender styling)
// + initial messages. Returns null when unauthenticated or not a participant (listMessages 403).
export async function getThreadView(conversationId: string) {
  const actorId = await currentActorId();
  if (!actorId) return null;
  let messages;
  try { messages = (await listMessages(actorId, conversationId)).data; }
  catch { return null; }  // ServiceError(403) non-participant -> treat as not found
  const client = await createClient();
  const { data: rows } = await client
    .from("conversation_participants")
    .select("actors!inner(id,type,display_name,avatar_url)")
    .eq("conversation_id", conversationId);
  const participants: Record<string, ThreadParticipant> = {};
  for (const r of rows ?? []) {
    const a = (r as unknown as { actors: ThreadParticipant | ThreadParticipant[] }).actors;
    const actor = Array.isArray(a) ? a[0] : a;
    if (actor?.id) participants[actor.id] = actor;
  }
  return { myActorId: actorId, participants, messages };
}
