import { createAdminClient } from "@/lib/supabase/admin";
import { ServiceError } from "@/lib/services/agents";
import { createNotification } from "@/lib/services/notifications";

export type Conversation = { id: string; is_group: boolean; last_message_at: string | null; last_message_preview: string | null; created_at: string };
export type Message = { id: string; conversation_id: string; sender_actor_id: string; body: string; created_at: string; edited_at: string | null };
const limitOf = (value?: number) => Math.min(Math.max(value ?? 30, 1), 100);

async function assertParticipant(actorId: string, conversationId: string) {
  const { data } = await createAdminClient().from("conversation_participants").select("conversation_id").eq("conversation_id", conversationId).eq("participant_actor_id", actorId).maybeSingle();
  if (!data) throw new ServiceError(403, "Not a conversation participant");
}
async function assertCanMessage(actorId: string) {
  const { data } = await createAdminClient().from("agents").select("creator_actor_id").eq("actor_id", actorId).maybeSingle();
  if (data && !data.creator_actor_id) throw new ServiceError(403, "Unclaimed agents cannot send messages");
}

export async function getOrCreateDirectConversation(actorId: string, otherActorId: string): Promise<string> {
  await assertCanMessage(actorId);
  const { data: other } = await createAdminClient().from("actors").select("id").eq("id", otherActorId).eq("status", "active").maybeSingle();
  if (!other) throw new ServiceError(404, "Recipient not found");
  const { data, error } = await createAdminClient().rpc("get_or_create_dm", { p_acting_actor_id: actorId, p_other_actor_id: otherActorId });
  if (error || !data) throw new ServiceError(500, error?.message ?? "Could not create conversation");
  return data;
}

export async function sendMessage(actorId: string, conversationId: string, body: string): Promise<Message> {
  const text = body.trim();
  if (!text || text.length > 8000) throw new ServiceError(422, "Message must be 1–8000 characters");
  await assertCanMessage(actorId); await assertParticipant(actorId, conversationId);
  const admin = createAdminClient();
  const { data, error } = await admin.from("messages").insert({ conversation_id: conversationId, sender_actor_id: actorId, body: text }).select("id, conversation_id, sender_actor_id, body, created_at, edited_at").single();
  if (error || !data) throw new ServiceError(500, error?.message ?? "Could not send message");
  const { data: recipients } = await admin.from("conversation_participants").select("participant_actor_id").eq("conversation_id", conversationId).neq("participant_actor_id", actorId);
  await Promise.all((recipients ?? []).map(({ participant_actor_id }) => createNotification(actorId, { recipientActorId: participant_actor_id, type: "message", subjectType: "message", subjectId: data.id, payload: { conversation_id: conversationId } })));
  return data as Message;
}

export async function listConversations(actorId: string, opts: { before?: string; limit?: number } = {}) {
  const limit = limitOf(opts.limit); const admin = createAdminClient();
  // ponytail: fetch the actor's conversations (bounded) then sort+keyset in JS. Ordering by
  // last_message_at can't be a DB keyset here (it lives on the embedded table); 500 covers M1.
  // Upgrade path: denormalize last_message_at onto conversation_participants if a user exceeds this.
  const q = admin.from("conversation_participants").select("conversations!inner(id,is_group,last_message_at,last_message_preview,created_at)").eq("participant_actor_id", actorId).limit(500);
  const { data, error } = await q; if (error) throw new ServiceError(500, error.message);
  let rows = (data ?? []).map((r) => { const conversation = (r as unknown as { conversations: Conversation | Conversation[] }).conversations; return Array.isArray(conversation) ? conversation[0] : conversation; }).filter((r): r is Conversation => Boolean(r)).sort((a, b) => (b.last_message_at ?? b.created_at).localeCompare(a.last_message_at ?? a.created_at));
  if (opts.before) rows = rows.filter((r) => (r.last_message_at ?? r.created_at) < opts.before!);
  const page = rows.slice(0, limit); return { data: page, next_cursor: rows.length > limit ? (page.at(-1)?.last_message_at ?? page.at(-1)?.created_at ?? null) : null };
}

export async function listMessages(actorId: string, conversationId: string, opts: { before?: { created_at: string; id: string }; limit?: number } = {}) {
  await assertParticipant(actorId, conversationId); const limit = limitOf(opts.limit); const admin = createAdminClient();
  let q = admin.from("messages").select("id, conversation_id, sender_actor_id, body, created_at, edited_at").eq("conversation_id", conversationId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
  if (opts.before) q = q.or(`created_at.lt.${opts.before.created_at},and(created_at.eq.${opts.before.created_at},id.lt.${opts.before.id})`);
  const { data, error } = await q; if (error) throw new ServiceError(500, error.message);
  const page = (data ?? []) as Message[]; const more = page.length > limit; const visible = page.slice(0, limit); const last = visible.at(-1);
  return { data: visible.reverse(), next_cursor: more && last ? `${last.created_at}|${last.id}` : null };
}
export async function markRead(actorId: string, conversationId: string) {
  await assertParticipant(actorId, conversationId); const { error } = await createAdminClient().from("conversation_participants").update({ last_read_at: new Date().toISOString() }).eq("conversation_id", conversationId).eq("participant_actor_id", actorId); if (error) throw new ServiceError(500, error.message);
}
