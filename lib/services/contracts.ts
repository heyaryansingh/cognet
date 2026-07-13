import { createAdminClient } from "@/lib/supabase/admin";
import { decodeCursor, encodeCursor } from "@/lib/api/http";
import { ServiceError } from "@/lib/services/agents";
export type ContractStatus="active"|"delivered"|"completed"|"cancelled"|"disputed"|"resolved_completed"|"resolved_cancelled";
type ContractRow={id:string;task_id:string;bid_id:string;client_actor_id:string;provider_actor_id:string;amount:number;status:ContractStatus;parent_contract_id:string|null;created_at:string;updated_at:string};
const map=(r:ContractRow)=>({id:r.id,taskId:r.task_id,bidId:r.bid_id,clientActorId:r.client_actor_id,providerActorId:r.provider_actor_id,amount:r.amount,status:r.status,parentContractId:r.parent_contract_id,createdAt:r.created_at,updatedAt:r.updated_at});
export async function getContract(actingActorId:string,id:string){const db=createAdminClient();const {data,error}=await db.from("contracts").select("*").eq("id",id).maybeSingle();if(error)throw new ServiceError(500,error.message);if(!data)throw new ServiceError(404,"Contract not found");if(![data.client_actor_id,data.provider_actor_id].includes(actingActorId))throw new ServiceError(403,"Not a contract party");const {data:events}=await db.from("contract_events").select("*").eq("contract_id",id).order("created_at");return {...map(data),events:events??[]};}
export async function listContracts(actingActorId:string,role:"client"|"provider"|"any"="any",cursor?:string){const db=createAdminClient();let q=db.from("contracts").select("*").or(role==="client"?`client_actor_id.eq.${actingActorId}`:role==="provider"?`provider_actor_id.eq.${actingActorId}`:`client_actor_id.eq.${actingActorId},provider_actor_id.eq.${actingActorId}`).order("created_at",{ascending:false}).order("id",{ascending:false}).limit(26);const c=cursor&&decodeCursor(cursor);if(c)q=q.or(`created_at.lt.${c.ts},and(created_at.eq.${c.ts},id.lt.${c.id})`);const {data,error}=await q;if(error)throw new ServiceError(500,error.message);const rows=data??[],page=rows.slice(0,25),last=page.at(-1);return {data:page.map(map),nextCursor:rows.length>25&&last?encodeCursor({ts:last.created_at,id:last.id}):null};}
// A4 parent-contract picker: only contracts where actor is provider AND active.
export async function listActiveProviderContracts(actorId:string){
  const {data,error}=await createAdminClient().from("contracts").select("id,amount,task:tasks!contracts_task_id_fkey(title)").eq("provider_actor_id",actorId).eq("status","active").order("created_at",{ascending:false}).limit(50);
  if(error)throw new ServiceError(500,error.message);
  return (data??[]).map(c=>({id:c.id,amount:c.amount,taskTitle:(c.task as unknown as {title:string}|null)?.title??"(untitled)"}));
}

async function transition(actingActorId:string,id:string,to:ContractStatus){const {data,error}=await createAdminClient().rpc("transition_contract",{p_acting_actor_id:actingActorId,p_contract_id:id,p_to_status:to});if(error)throw new ServiceError(error.code==="P0001"?404:error.code==="42501"?403:409,error.message);return map(data)}
export const markDelivered=(actor:string,id:string)=>transition(actor,id,"delivered");
export const completeContract=(actor:string,id:string)=>transition(actor,id,"completed");
export const disputeContract=(actor:string,id:string)=>transition(actor,id,"disputed"); export const cancelContract=(actor:string,id:string)=>transition(actor,id,"cancelled");
