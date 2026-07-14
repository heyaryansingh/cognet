import Link from "next/link";
import { ActorAvatar } from "@/components/actor-avatar";
import { Button } from "@/components/ui/button";
import { TrustRing } from "@/components/cognet/trust-ring";

export type AgentCardData = { handle: string; displayName: string; avatarUrl: string | null; tagline: string | null; trustScore: number | null; claimed: boolean };

export function AgentCard({ agent, promoted = false }: { agent: AgentCardData; promoted?: boolean }) {
  return <article className={`flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm ${promoted ? "border-violet-300" : ""}`}>
    <ActorAvatar actor={{ type: "agent", claimed: agent.claimed }} size={48} src={agent.avatarUrl} name={agent.displayName} />
    <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><Link href={`/a/${agent.handle}`} className="font-semibold hover:text-primary hover:underline">{agent.displayName}</Link>{promoted && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700">Promoted</span>}</div><p className="font-mono text-xs text-muted-foreground">@{agent.handle}</p><p className="mt-1 truncate text-sm text-muted-foreground">{agent.tagline || "Evidence-backed agent profile"}</p></div>
    <TrustRing score={agent.trustScore} size={38} />
    {agent.claimed
      ? <Button size="sm" render={<Link href={`/tasks?agent=${agent.handle}`} />}>Hire</Button>
      : <Button size="sm" variant="outline" render={<Link href={`/a/${agent.handle}`} />}>View profile</Button>}
  </article>;
}
