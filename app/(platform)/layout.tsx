import Link from "next/link";
import { TopNav } from "@/components/shell/top-nav";
import { ActorAvatar } from "@/components/actor-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentActorId } from "@/lib/data/messages";
import { getTrendingAgents } from "@/lib/services/agents";

async function LeftRail() {
  const actorId = await currentActorId();
  if (!actorId) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-1 py-6 text-center">
          <div className="size-16 rounded-full bg-muted" />
          <p className="mt-2 font-semibold">Welcome to Cognet</p>
          <p className="text-sm text-muted-foreground">Sign in to build your presence</p>
          <Button size="sm" className="mt-3" render={<Link href="/auth/sign-in" />}>Sign in</Button>
        </CardContent>
      </Card>
    );
  }
  const db = createAdminClient();
  const [{ data: actor }, { data: human }, { count: followerCount }, { count: agentCount }] = await Promise.all([
    db.from("actors").select("handle, display_name, avatar_url").eq("id", actorId).maybeSingle(),
    db.from("humans").select("headline").eq("actor_id", actorId).maybeSingle(),
    db.from("follows").select("*", { count: "exact", head: true }).eq("followed_actor_id", actorId),
    db.from("agents").select("*", { count: "exact", head: true }).eq("creator_actor_id", actorId),
  ]);
  if (!actor) return null;
  return (
    <Card className="overflow-hidden py-0">
      <div className="h-14 bg-[#24406B]" />
      <CardContent className="flex flex-col items-center pb-5 text-center">
        <ActorAvatar actor={{ type: "human" }} size={64} src={actor.avatar_url} name={actor.display_name} className="-mt-8 border-4 border-card" />
        <Link href={`/u/${actor.handle}`} className="mt-2 font-semibold hover:underline">{actor.display_name}</Link>
        <p className="font-mono text-xs text-muted-foreground">@{actor.handle}</p>
        {human?.headline && <p className="mt-1 text-xs text-muted-foreground">{human.headline}</p>}
        <div className="mt-4 grid w-full grid-cols-2 divide-x border-t pt-3 text-center">
          <div><p className="font-mono text-sm font-bold">{followerCount ?? 0}</p><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Followers</p></div>
          <div><p className="font-mono text-sm font-bold">{agentCount ?? 0}</p><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Agents</p></div>
        </div>
        <Button size="sm" variant="outline" className="mt-4 w-full" render={<Link href={`/u/${actor.handle}`} />}>View profile</Button>
      </CardContent>
    </Card>
  );
}

async function RightRail() {
  let trending: Awaited<ReturnType<typeof getTrendingAgents>> = [];
  try { trending = await getTrendingAgents(5); } catch { /* rail is optional chrome */ }
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-5">
          <p className="font-semibold">Trending agents</p>
          {trending.length ? (
            <div className="mt-3 space-y-3">
              {trending.map((agent) => (
                <Link key={agent.actorId} href={`/a/${agent.handle}`} className="flex items-center gap-2 rounded-md p-1 hover:bg-muted">
                  <ActorAvatar actor={{ type: "agent", claimed: agent.claimed }} size={32} src={agent.avatarUrl} name={agent.displayName} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{agent.displayName}</p>
                    <p className="truncate text-xs text-muted-foreground">{agent.stars !== null ? `★ ${agent.stars.toLocaleString()}` : ""}{agent.category ? ` · ${agent.category}` : ""}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Coming soon</p>
          )}
          <Button size="sm" variant="ghost" className="mt-3 w-full" render={<Link href="/directory" />}>Browse directory</Button>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="py-5">
          <p className="font-semibold">Leaderboards</p>
          <p className="mt-1 text-sm text-muted-foreground">Verified benchmark scores from official suites.</p>
          <Button size="sm" variant="ghost" className="mt-3 w-full" render={<Link href="/leaderboards" />}>See rankings</Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function PlatformLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen">
      <TopNav />
      <div className="mx-auto grid max-w-[var(--shell-max)] grid-cols-1 gap-6 px-4 py-6 md:grid-cols-[240px_minmax(0,1fr)] lg:grid-cols-[240px_minmax(0,1fr)_300px]">
        <aside className="hidden md:block">
          <LeftRail />
        </aside>
        <main>{children}</main>
        <aside className="hidden lg:block">
          <RightRail />
        </aside>
      </div>
    </div>
  );
}
