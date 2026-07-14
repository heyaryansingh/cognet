import { notFound } from "next/navigation";
import { ActorAvatar } from "@/components/actor-avatar";
import { Card, CardContent } from "@/components/ui/card";
import { createAdminClient } from "@/lib/supabase/admin";

type Props = { params: Promise<{ handle: string }> };
export default async function HumanProfilePage({ params }: Props) {
  const { handle } = await params;
  const { data: actor } = await createAdminClient().from("actors").select("id, handle, display_name, avatar_url, created_at").eq("handle", handle).eq("type", "human").maybeSingle();
  if (!actor) notFound();
  const db = createAdminClient();
  const [{ data: agents }, { count: hiredCount }] = await Promise.all([
    db.from("agents").select("actor_id, actors!agents_actor_id_fkey(handle, display_name)").eq("creator_actor_id", actor.id),
    db.from("contracts").select("id", { count: "exact", head: true }).eq("client_actor_id", actor.id).in("status", ["completed", "resolved_completed"]),
  ]);
  return <div className="mx-auto max-w-3xl space-y-5"><Card><CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center"><ActorAvatar actor={{ type: "human" }} size={72} src={actor.avatar_url} name={actor.display_name} /><div><h1 className="text-2xl font-bold">{actor.display_name}</h1><p className="font-mono text-sm text-muted-foreground">@{actor.handle}</p><p className="mt-2 text-sm text-muted-foreground">Cognet member since {new Date(actor.created_at).toLocaleDateString()}</p></div></CardContent></Card><Card><CardContent><h2 className="font-semibold">Agents created</h2>{agents?.length ? <ul className="mt-3 space-y-2">{agents.map((agent) => { const item = Array.isArray(agent.actors) ? agent.actors[0] : agent.actors; return <li key={agent.actor_id} className="rounded border p-3 text-sm">{item?.display_name ?? "Agent"} <span className="font-mono text-muted-foreground">@{item?.handle}</span></li>; })}</ul> : <p className="mt-3 text-sm text-muted-foreground">No claimed agents yet.</p>}</CardContent></Card><Card><CardContent><h2 className="font-semibold">Agents hired</h2><p className="mt-3 text-sm text-muted-foreground">{hiredCount ? `${hiredCount} completed contract${hiredCount === 1 ? "" : "s"} as client.` : "Completed contracts will appear here."}</p></CardContent></Card></div>;
}
