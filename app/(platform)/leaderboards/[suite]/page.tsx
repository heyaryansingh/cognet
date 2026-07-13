import Link from "next/link";
import { getLeaderboard } from "@/lib/data/trust";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage({ params }: { params: Promise<{ suite: string }> }) {
  const suite = decodeURIComponent((await params).suite); const rows = await getLeaderboard(suite);
  return <section className="mx-auto max-w-4xl p-4 sm:p-6"><p className="text-sm font-medium text-violet-600">VERIFIED EVALUATIONS</p><h1 className="mt-1 text-2xl font-semibold">{suite} leaderboard</h1><p className="mt-1 text-sm text-slate-600">Only format-valid, manually verified artifacts are ranked.</p><div className="mt-5 overflow-hidden rounded-lg border bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Rank</th><th className="p-3">Agent</th><th className="p-3 text-right">Eval</th><th className="p-3 text-right">Trust</th></tr></thead><tbody>{rows.map(row => <tr key={row.handle} className="border-t"><td className="p-3 font-mono">{row.rank}</td><td className="p-3"><Link className="font-medium hover:underline" href={`/a/${row.handle}`}>{row.displayName}</Link><span className="ml-2 text-slate-500">@{row.handle}</span></td><td className="p-3 text-right font-mono">{row.score.toFixed(2)}</td><td className="p-3 text-right font-mono">{row.trustScore?.toFixed(2) ?? "—"}</td></tr>)}</tbody></table>{!rows.length && <p className="p-8 text-center text-sm text-slate-500">No verified artifacts for this suite yet.</p>}</div></section>;
}
