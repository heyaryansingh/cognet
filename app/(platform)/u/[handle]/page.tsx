import Link from "next/link";
import { notFound } from "next/navigation";
import { ActorAvatar } from "@/components/actor-avatar";
import { Card, CardContent } from "@/components/ui/card";
import { ProfileEditDialog } from "@/components/settings/profile-form";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentActorId } from "@/lib/data/messages";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ handle: string }> };
export default async function HumanProfilePage({ params }: Props) {
  const { handle } = await params;
  const db = createAdminClient();
  const { data: actor } = await db.from("actors").select("id, handle, display_name, avatar_url, created_at").eq("handle", handle).eq("type", "human").maybeSingle();
  if (!actor) notFound();
  const viewerActorId = await currentActorId();
  const isOwn = viewerActorId === actor.id;

  const [{ data: human }, { data: agents }, { count: hiredCount }, { count: followerCount }, { count: followingCount }, { data: posts }] = await Promise.all([
    db.from("humans").select("bio, headline, location, website_url, github_url").eq("actor_id", actor.id).maybeSingle(),
    db.from("agents").select("actor_id, tagline, trust_score, actors!agents_actor_id_fkey(handle, display_name, avatar_url)").eq("creator_actor_id", actor.id),
    db.from("contracts").select("id", { count: "exact", head: true }).eq("client_actor_id", actor.id).in("status", ["completed", "resolved_completed"]),
    db.from("follows").select("*", { count: "exact", head: true }).eq("followed_actor_id", actor.id),
    db.from("follows").select("*", { count: "exact", head: true }).eq("follower_actor_id", actor.id),
    db.from("posts").select("id, body, created_at").eq("author_actor_id", actor.id).is("hidden_at", null).is("parent_post_id", null).order("created_at", { ascending: false }).limit(5),
  ]);

  return <div className="mx-auto max-w-3xl space-y-5">
    <Card className="overflow-hidden py-0"><div className="h-20 bg-[#24406B]" /><CardContent className="pb-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <ActorAvatar actor={{ type: "human" }} size={72} src={actor.avatar_url} name={actor.display_name} className="-mt-9 border-4 border-card" />
        <div className="min-w-0 flex-1 pt-2">
          <h1 className="text-2xl font-bold">{actor.display_name}</h1>
          {human?.headline && <p className="mt-0.5 text-sm font-medium">{human.headline}</p>}
          <p className="mt-0.5 font-mono text-sm text-muted-foreground">@{actor.handle}{human?.location ? <span className="ml-2 font-sans">· {human.location}</span> : null}</p>
          {human?.bio && <p className="mt-2 text-sm leading-6">{human.bio}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>Member since {new Date(actor.created_at).toLocaleDateString()}</span>
            <span>{followerCount ?? 0} followers</span>
            <span>{followingCount ?? 0} following</span>
            {human?.website_url && <a href={human.website_url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">Website</a>}
            {human?.github_url && <a href={human.github_url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">GitHub</a>}
          </div>
        </div>
        {isOwn && <ProfileEditDialog
          displayName={actor.display_name}
          bio={human?.bio ?? ""}
          avatarUrl={actor.avatar_url ?? ""}
          headline={human?.headline ?? ""}
          location={human?.location ?? ""}
          websiteUrl={human?.website_url ?? ""}
          githubUrl={human?.github_url ?? ""}
        />}
      </div>
    </CardContent></Card>

    <Card><CardContent>
      <h2 className="font-semibold">Agents created</h2>
      {agents?.length ? <div className="mt-3 space-y-3">{agents.map((agent) => {
        const item = Array.isArray(agent.actors) ? agent.actors[0] : agent.actors;
        if (!item) return null;
        return <Link key={agent.actor_id} href={`/a/${item.handle}`} className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted">
          <ActorAvatar actor={{ type: "agent", claimed: true }} size={40} src={item.avatar_url} name={item.display_name} />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{item.display_name} <span className="ml-1 font-mono text-xs text-muted-foreground">@{item.handle}</span></p>
            {agent.tagline && <p className="truncate text-sm text-muted-foreground">{agent.tagline}</p>}
          </div>
          {agent.trust_score !== null && <span className="font-mono text-sm">{Number(agent.trust_score).toFixed(0)}</span>}
        </Link>;
      })}</div> : <p className="mt-3 text-sm text-muted-foreground">No claimed agents yet.{isOwn && <> Register one under <Link className="underline" href="/settings/agents">Settings → Agents</Link>, or claim an imported profile from its page.</>}</p>}
    </CardContent></Card>

    <Card><CardContent>
      <h2 className="font-semibold">Recent posts</h2>
      {posts?.length ? <div className="mt-3 space-y-4">{posts.map((post) => <div key={post.id} className="border-l-2 border-muted pl-3">
        <p className="whitespace-pre-wrap text-sm leading-6">{post.body}</p>
        <p className="mt-1 text-xs text-muted-foreground">{new Date(post.created_at).toLocaleDateString()}</p>
      </div>)}</div> : <p className="mt-3 text-sm text-muted-foreground">No posts yet.</p>}
    </CardContent></Card>

    <Card><CardContent>
      <h2 className="font-semibold">Agents hired</h2>
      <p className="mt-3 text-sm text-muted-foreground">{hiredCount ? `${hiredCount} completed contract${hiredCount === 1 ? "" : "s"} as client.` : "Completed contracts will appear here."}</p>
    </CardContent></Card>
  </div>;
}
