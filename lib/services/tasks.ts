import { createAdminClient } from "@/lib/supabase/admin";
import { decodeCursor, encodeCursor } from "@/lib/api/http";
import { ServiceError } from "@/lib/services/agents";
import { getOrCreateDirectConversation } from "@/lib/services/messages";

export type TaskStatus = "open" | "assigned" | "completed" | "cancelled";
export type Page<T> = { data: T[]; nextCursor: string | null };
export type Task = { id: string; posterActorId: string; title: string; body: string; tags: string[]; budgetMin: number | null; budgetMax: number | null; status: TaskStatus; bidCount?: number; createdAt: string };
type TaskRow = { id:string; poster_actor_id:string; title:string; body:string; tags:string[]|null; budget_min:number|null; budget_max:number|null; status:TaskStatus; bid_count?:number; created_at:string };
const task = (r: TaskRow): Task => ({ id:r.id, posterActorId:r.poster_actor_id, title:r.title, body:r.body, tags:r.tags ?? [], budgetMin:r.budget_min, budgetMax:r.budget_max, status:r.status, bidCount:r.bid_count, createdAt:r.created_at });

export async function createTask(actingActorId: string, input: {title:string; body?:string; tags?:string[]; budgetMin?:number; budgetMax?:number; parentContractId?:string; acceptanceSpec?:unknown}) {
  if (input.title.trim().length < 3 || input.title.trim().length > 200) throw new ServiceError(422,"Title must be 3-200 characters");
  if (input.budgetMin != null && input.budgetMax != null && input.budgetMin > input.budgetMax) throw new ServiceError(422,"Minimum budget cannot exceed maximum");
  const db=createAdminClient();
  if (input.parentContractId) { const {data}=await db.from("contracts").select("provider_actor_id,status").eq("id",input.parentContractId).maybeSingle(); if (!data || data.provider_actor_id!==actingActorId || data.status!=="active") throw new ServiceError(403,"Only an active contract provider can subcontract"); }
  const {data,error}=await db.from("tasks").insert({poster_actor_id:actingActorId,title:input.title.trim(),body:input.body?.trim()??"",tags:input.tags??[],budget_min:input.budgetMin??null,budget_max:input.budgetMax??null,parent_contract_id:input.parentContractId??null,acceptance_spec:input.acceptanceSpec??null}).select().single();
  if(error) throw new ServiceError(500,error.message); return task(data);
}

export type TaskWithPoster = Task & { poster:{ handle:string; displayName:string; avatarUrl:string|null; type:"human"|"agent"|"org"; claimed:boolean } };

// Board is a discovery surface: suspended posters' tasks hidden (director
// ruling 13:31:46). posterType = the co-equal-citizens filter (wireframe).
export async function listTasks(filter:{status?:TaskStatus;tag?:string;posterType?:"human"|"agent";cursor?:string;limit?:number}={}) : Promise<Page<TaskWithPoster>> {
  const db=createAdminClient(), limit=Math.min(Math.max(filter.limit??25,1),50);
  let q=db.from("tasks").select("*, poster:actors!tasks_poster_actor_id_fkey!inner(handle,display_name,avatar_url,type,status,agents!agents_actor_id_fkey(creator_actor_id))").eq("poster.status","active").eq("status",filter.status??"open").order("created_at",{ascending:false}).order("id",{ascending:false}).limit(limit+1);
  if(filter.tag) q=q.contains("tags",[filter.tag]); if(filter.posterType) q=q.eq("poster.type",filter.posterType);
  const c=filter.cursor&&decodeCursor(filter.cursor); if(c) q=q.or(`created_at.lt.${c.ts},and(created_at.eq.${c.ts},id.lt.${c.id})`);
  const {data,error}=await q; if(error) throw new ServiceError(500,error.message);
  type Row = TaskRow & { poster:{ handle:string; display_name:string; avatar_url:string|null; type:"human"|"agent"|"org"; agents:{creator_actor_id:string|null}[]|null } };
  const rows=(data??[]) as Row[], more=rows.length>limit, page=rows.slice(0,limit), last=page.at(-1);
  return {data:page.map(r=>({...task(r), poster:{handle:r.poster.handle,displayName:r.poster.display_name,avatarUrl:r.poster.avatar_url,type:r.poster.type,claimed:r.poster.type!=="agent"||!!r.poster.agents?.[0]?.creator_actor_id}})), nextCursor:more&&last?encodeCursor({ts:last.created_at,id:last.id}):null};
}

export async function getTask(id:string) { const db=createAdminClient(); const {data,error}=await db.from("tasks").select("*").eq("id",id).maybeSingle(); if(error) throw new ServiceError(500,error.message); if(!data) throw new ServiceError(404,"Task not found"); return task(data); }
export async function createBid(actingActorId:string,input:{taskId:string;amount:number;proposal?:string}) { const db=createAdminClient(); const {data:agent}=await db.from("agents").select("creator_actor_id").eq("actor_id",actingActorId).maybeSingle(); if(agent && !agent.creator_actor_id) throw new ServiceError(403,"Unclaimed agents cannot bid"); const {data:job}=await db.from("tasks").select("poster_actor_id,status").eq("id",input.taskId).maybeSingle(); if(!job) throw new ServiceError(404,"Task not found"); if(job.status!=="open") throw new ServiceError(409,"Task is not open"); if(job.poster_actor_id===actingActorId) throw new ServiceError(422,"Cannot bid on your own task"); const {count}=await db.from("bids").select("id",{count:"exact",head:true}).eq("bidder_actor_id",actingActorId).gte("created_at",new Date(Date.now()-86400000).toISOString()); if((count??0)>=20) throw new ServiceError(429,"Daily bid limit reached"); const {data,error}=await db.from("bids").insert({task_id:input.taskId,bidder_actor_id:actingActorId,amount:input.amount,proposal:input.proposal??""}).select().single(); if(error) throw new ServiceError(error.code==="23505"?409:500,error.code==="23505"?"Pending bid already exists":error.message); return data; }
export type ActorIdentitySummary = { actorId:string; handle:string; displayName:string; avatarUrl:string|null; type:"human"|"agent"|"org"; claimed:boolean; trustScore:number|null };
type ActorJoin = { id:string; handle:string; display_name:string; avatar_url:string|null; type:"human"|"agent"|"org"; agents:{ creator_actor_id:string|null; trust_score:number|null }[]|null };
const identity=(a:ActorJoin):ActorIdentitySummary=>({actorId:a.id,handle:a.handle,displayName:a.display_name,avatarUrl:a.avatar_url,type:a.type,claimed:a.type!=="agent"||!!a.agents?.[0]?.creator_actor_id,trustScore:a.agents?.[0]?.trust_score??null});

// Task detail page needs poster identity (glyph/AI-label derive from actors.type).
export async function getTaskDetail(id:string) {
  const db=createAdminClient();
  const {data,error}=await db.from("tasks").select("*, poster:actors!tasks_poster_actor_id_fkey(id,handle,display_name,avatar_url,type,agents!agents_actor_id_fkey(creator_actor_id,trust_score))").eq("id",id).maybeSingle();
  if(error) throw new ServiceError(500,error.message); if(!data) throw new ServiceError(404,"Task not found");
  const {poster,...row}=data;
  return {...task(row as TaskRow), parentContractId:(row as {parent_contract_id:string|null}).parent_contract_id, acceptanceSpec:(row as {acceptance_spec:unknown}).acceptance_spec, poster:identity(poster as ActorJoin)};
}

export type BidWithBidder = { id:string; amount:number; proposal:string; status:string; createdAt:string; bidder:ActorIdentitySummary };

// Visibility mirrors bids RLS: poster sees all bids; a bidder sees only their
// own; anyone else sees none. (Public bids = open product question w/ review.)
export async function listBids(viewerActorId:string|null,taskId:string):Promise<BidWithBidder[]> {
  const db=createAdminClient();
  const {data:job}=await db.from("tasks").select("poster_actor_id").eq("id",taskId).maybeSingle();
  if(!job) throw new ServiceError(404,"Task not found");
  if(!viewerActorId) return [];
  let q=db.from("bids").select("id,amount,proposal,status,created_at, bidder:actors!bids_bidder_actor_id_fkey(id,handle,display_name,avatar_url,type,agents!agents_actor_id_fkey(creator_actor_id,trust_score))").eq("task_id",taskId).order("created_at",{ascending:true});
  if(job.poster_actor_id!==viewerActorId) q=q.eq("bidder_actor_id",viewerActorId);
  const {data,error}=await q; if(error) throw new ServiceError(500,error.message);
  return (data??[]).map(b=>({id:b.id,amount:b.amount,proposal:b.proposal,status:b.status,createdAt:b.created_at,bidder:identity(b.bidder as unknown as ActorJoin)}));
}

export async function countBids(taskId:string):Promise<number> {
  const {count}=await createAdminClient().from("bids").select("id",{count:"exact",head:true}).eq("task_id",taskId).neq("status","withdrawn");
  return count??0;
}

// Seam ruling 17:22:57: after the hire tx COMMITS, open the client-provider
// DM (idempotent get_or_create_dm). Best-effort - a DM failure never fails
// the hire.
async function openContractDm(clientActorId:string,providerActorId:string) {
  try { await getOrCreateDirectConversation(clientActorId, providerActorId); }
  catch (e) { console.error("contract DM creation failed (non-fatal)", e); }
}

export async function acceptBid(actingActorId:string,bidId:string) { const {data,error}=await createAdminClient().rpc("accept_bid",{p_acting_actor_id:actingActorId,p_bid_id:bidId}); if(error) throw new ServiceError(error.code==="P0002"||error.code==="P0001"?404:error.code==="42501"?403:409,error.message); await openContractDm(data.client_actor_id,data.provider_actor_id); return {contractId:data.id}; }

// Direct hire (director ruling 13:40:28 option a) - impl-1's HireModal calls this.
// One atomic hire_agent() rpc: task + single bid + accept_bid(); partial failure
// rolls back everything, so retries cannot orphan an open task.
export async function hireAgent(actingActorId:string,input:{agentActorId:string;title:string;scope?:string;amount:number}) {
  if (!(input.amount>=0)) throw new ServiceError(422,"Amount must be >= 0");
  if (input.title.trim().length < 3 || input.title.trim().length > 200) throw new ServiceError(422,"Title must be 3-200 characters");
  const {data,error}=await createAdminClient().rpc("hire_agent",{p_acting_actor_id:actingActorId,p_agent_actor_id:input.agentActorId,p_title:input.title.trim(),p_body:input.scope??"",p_amount:input.amount});
  if(error) throw new ServiceError(error.code==="P0002"?404:error.code==="42501"?403:409,error.message);
  await openContractDm(data.client_actor_id,data.provider_actor_id);
  return {taskId:data.task_id as string,bidId:data.bid_id as string,contractId:data.id as string};
}
