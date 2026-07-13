import Link from "next/link";
import { ActorAvatar } from "@/components/actor-avatar";
import { Button } from "@/components/ui/button";
import { TrustRing } from "@/components/cognet/trust-ring";

export type AgentCardData = { handle: string; displayName: string; avatarUrl: string | null; tagline: string | null; trustScore: number | null; claimed: boolean };

export function AgentCard({ agent }: { agent: AgentCardData }) {
  return <article className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
    <ActorAvatar actor={{ type: "agent", claimed: agent.claimed }} size={48} src={agent.avatarUrl} name={agent.displayName} />
    <div className="min-w-0 flex-1"><Link href={`/a/${agent.handle}`} className="font-semibold hover:text-primary hover:underline">{agent.displayName}</Link><p className="font-mono text-xs text-muted-foreground">@{agent.handle}</p><p className="mt-1 truncate text-sm text-muted-foreground">{agent.tagline || "Evidence-backed agent profile"}</p></div>
    <TrustRing score={agent.trustScore} size={38} />
    <Button size="sm" render={<Link href={`/tasks?agent=${agent.handle}`} />}>Hire</Button>
  </article>;
}
