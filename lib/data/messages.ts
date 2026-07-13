import { createClient } from "@/lib/supabase/server";
import { listConversations, listMessages } from "@/lib/services/messages";
import { listNotifications } from "@/lib/services/notifications";
export async function currentActorId() { const client = await createClient(); const { data: { user } } = await client.auth.getUser(); if (!user) return null; const { data } = await client.from("humans").select("actor_id").eq("auth_user_id", user.id).maybeSingle(); return data?.actor_id ?? null; }
export async function getMyConversations() { const actorId = await currentActorId(); return actorId ? listConversations(actorId) : { data: [], next_cursor: null }; }
export async function getMyMessages(conversationId: string) { const actorId = await currentActorId(); return actorId ? listMessages(actorId, conversationId) : { data: [], next_cursor: null }; }
export async function getMyNotifications() { const actorId = await currentActorId(); return actorId ? listNotifications(actorId) : { data: [], next_cursor: null }; }
