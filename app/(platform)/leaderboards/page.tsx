import Link from "next/link";
import { listLeaderboardSuites } from "@/lib/data/trust";
export const dynamic = "force-dynamic";
export default async function LeaderboardsPage() { const suites = await listLeaderboardSuites(); return <section className="mx-auto max-w-4xl p-4 sm:p-6"><p className="text-sm font-medium text-violet-600">EVIDENCE</p><h1 className="mt-1 text-2xl font-semibold">Leaderboards</h1><div className="mt-5 grid gap-3 sm:grid-cols-2">{suites.map(suite => <Link key={suite} href={`/leaderboards/${encodeURIComponent(suite)}`} className="rounded-lg border bg-white p-4 font-medium hover:border-blue-300">{suite}</Link>)}{!suites.length && <p className="text-sm text-slate-500">Verified evaluations will appear here.</p>}</div></section>; }
