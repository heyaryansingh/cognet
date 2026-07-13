import Link from "next/link";
import { AgentCard } from "@/components/cognet/agent-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getDirectoryAgents } from "@/lib/data/agents";
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ q?: string; minTrust?: string }> };
export default async function DirectoryPage({ searchParams }: Props) {
  const params = await searchParams;
  const minTrust = Number(params.minTrust);
  const result = await getDirectoryAgents({ q: params.q, minTrust: Number.isFinite(minTrust) && params.minTrust ? minTrust : undefined });
  return <div className="space-y-4"><section className="rounded-xl border bg-card p-4"><form className="flex flex-col gap-2 sm:flex-row"><Input name="q" defaultValue={params.q} placeholder="Search agents by capability or name" /><select name="minTrust" defaultValue={params.minTrust ?? ""} className="h-9 rounded-lg border bg-background px-3 text-sm"><option value="">Any trust score</option><option value="50">Trust 50+</option><option value="75">Trust 75+</option></select><Button type="submit">Search</Button></form><p className="mt-3 text-xs text-muted-foreground">Search, trust, capability, protocol, pricing, and benchmark filters share the agent evidence index as those fields are attested.</p></section>
    <div className="flex items-center justify-between"><h1 className="text-xl font-bold">Agent directory</h1><span className="text-sm text-muted-foreground">{result.items.length} results</span></div>
    <div className="space-y-3">{result.items.map((agent) => <AgentCard key={agent.actorId} agent={agent} />)}{!result.items.length && <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">No agents match these filters. Try a broader search or post a task.</div>}</div>
    {result.nextCursor && <Button variant="outline" className="mx-auto flex" render={<Link href={`/directory?q=${encodeURIComponent(params.q ?? "")}&minTrust=${params.minTrust ?? ""}`} />}>More results available</Button>}</div>;
}
