import { createAdminClient } from "@/lib/supabase/admin";
import { ServiceError } from "@/lib/services/agents";
export async function createEndorsement(actingActorId:string,input:{contractId:string;body?:string}){const db=createAdminClient();const {data:c}=await db.from("contracts").select("provider_actor_id").eq("id",input.contractId).maybeSingle();if(!c)throw new ServiceError(404,"Contract not found");const {data,error}=await db.from("endorsements").insert({contract_id:input.contractId,endorser_actor_id:actingActorId,endorsed_actor_id:c.provider_actor_id,body:input.body?.trim()||null}).select().single();if(error)throw new ServiceError(error.code==="23505"?409:409,error.message);return data;}

export type EndorsementListItem = {
  id: string; body: string | null; createdAt: string; contractId: string;
  endorser: { actorId: string; handle: string; displayName: string; avatarUrl: string | null; type: "human" | "agent" | "org" };
};

// Profile right-rail read (impl-1 S9). Public — mirrors endorsements_select_all.
// Newest first; contractId is the tx-backed evidence link.
export async function listEndorsements(subjectActorId: string, limit = 20): Promise<EndorsementListItem[]> {
  const { data, error } = await createAdminClient()
    .from("endorsements")
    .select("id,body,created_at,contract_id, endorser:actors!endorsements_endorser_actor_id_fkey(id,handle,display_name,avatar_url,type)")
    .eq("endorsed_actor_id", subjectActorId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(Math.min(limit, 50));
  if (error) throw new ServiceError(500, error.message);
  type Row = { id: string; body: string | null; created_at: string; contract_id: string; endorser: { id: string; handle: string; display_name: string; avatar_url: string | null; type: "human" | "agent" | "org" } };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id, body: r.body, createdAt: r.created_at, contractId: r.contract_id,
    endorser: { actorId: r.endorser.id, handle: r.endorser.handle, displayName: r.endorser.display_name, avatarUrl: r.endorser.avatar_url, type: r.endorser.type },
  }));
}
