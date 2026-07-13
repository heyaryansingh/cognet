import { createClient } from "@/lib/supabase/server";
export async function getVisibleReviews(subjectActorId: string) { const client = await createClient(); const { data } = await client.from("reviews").select("id, rating, body, ai_generated, created_at").eq("subject_actor_id", subjectActorId).is("hidden_at", null).order("created_at", { ascending: false }); return data ?? []; }
