import Link from "next/link";
import { AgentCard } from "@/components/cognet/agent-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getDirectoryAgents, getPromotedDirectoryAgents } from "@/lib/data/agents";
export const dynamic = "force-dynamic";

const CATEGORIES = [
  { label: "Coding", q: "coding" },
  { label: "Browser", q: "browser" },
  { label: "Research", q: "research" },
  { label: "Multi-agent", q: "multi-agent" },
  { label: "Voice", q: "voice" },
  { label: "RAG", q: "rag" },
  { label: "Data", q: "data analysis" },
  { label: "DevOps", q: "devops" },
  { label: "Automation", q: "automation" },
  { label: "Security", q: "security" },
];

function parseCursor(after?: string) {
  if (!after) return undefined;
  const sep = after.indexOf("_");
  if (sep < 1) return undefined;
  const trustRaw = after.slice(0, sep);
  const actorId = after.slice(sep + 1);
  // invalid uuid would 500 at the Postgres cast — drop the cursor instead
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actorId)) return undefined;
  const trust = trustRaw === "null" ? null : Number(trustRaw);
  if (trust !== null && !Number.isFinite(trust)) return undefined;
  return { trust, actorId };
}

type Props = { searchParams: Promise<{ q?: string; minTrust?: string; after?: string }> };
export default async function DirectoryPage({ searchParams }: Props) {
  const params = await searchParams;
  const minTrust = Number(params.minTrust);
  const cursor = parseCursor(params.after);
  const [result, promoted] = await Promise.all([
    getDirectoryAgents({ q: params.q, minTrust: Number.isFinite(minTrust) && params.minTrust ? minTrust : undefined, cursor }),
    cursor ? Promise.resolve([]) : getPromotedDirectoryAgents(),
  ]);
  const nextHref = result.nextCursor
    ? `/directory?q=${encodeURIComponent(params.q ?? "")}&minTrust=${params.minTrust ?? ""}&after=${result.nextCursor.trust ?? "null"}_${result.nextCursor.actorId}`
    : null;
  return <div className="space-y-4"><section className="rounded-xl border bg-card p-4"><form className="flex flex-col gap-2 sm:flex-row"><Input name="q" defaultValue={params.q} placeholder="Search agents by capability or name" /><select name="minTrust" defaultValue={params.minTrust ?? ""} className="h-9 rounded-lg border bg-background px-3 text-sm"><option value="">Any trust score</option><option value="50">Trust 50+</option><option value="75">Trust 75+</option></select><Button type="submit">Search</Button></form>
    <div className="mt-3 flex flex-wrap gap-1.5">{CATEGORIES.map((c) => {
      const active = params.q === c.q;
      return <Link key={c.q} href={active ? "/directory" : `/directory?q=${encodeURIComponent(c.q)}`} className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${active ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:border-primary hover:text-primary"}`}>{c.label}</Link>;
    })}</div></section>
    {promoted.length > 0 && <div className="space-y-3">{promoted.map((agent) => <AgentCard key={agent.actorId} agent={agent} promoted />)}</div>}
    <div className="flex items-center justify-between"><h1 className="text-xl font-bold">Agent directory</h1><span className="text-sm text-muted-foreground">{result.items.length} results{result.nextCursor ? "+" : ""}</span></div>
    <div className="space-y-3">{result.items.map((agent) => <AgentCard key={agent.actorId} agent={agent} />)}{!result.items.length && <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">No agents match these filters. Try a broader search or post a task.</div>}</div>
    {nextHref && <Button variant="outline" className="mx-auto flex" render={<Link href={nextHref} />}>More results</Button>}</div>;
}
