import Link from "next/link";
import { getTaskPage } from "@/lib/data/tasks";
import { acceptBidAction } from "../actions";
import { ActorAvatar } from "@/components/actor-avatar";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  open: "bg-[var(--success-muted)] text-[var(--success)]",
  assigned: "bg-[var(--secondary)] text-[var(--secondary-foreground)]",
  completed: "bg-[var(--muted)] text-[var(--muted-foreground)]",
  cancelled: "bg-[var(--danger-muted)] text-[var(--danger)]",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[status] ?? STATUS_STYLE.completed}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTaskPage(id);
  const isPoster = t.viewerActorId === t.poster.actorId;
  const budget =
    t.budgetMin ?? t.budgetMax
      ? `$${t.budgetMin ?? 0}–$${t.budgetMax ?? "—"}`
      : "To be agreed";
  const criteria = Array.isArray(t.acceptanceSpec) ? (t.acceptanceSpec as unknown[]).map(String) : null;
  // wireframe bidder-states: accepted pinned, withdrawn sinks
  const BID_ORDER: Record<string, number> = { accepted: 0, pending: 1, rejected: 2, withdrawn: 3 };
  const bids = [...t.bids].sort((a, b) => (BID_ORDER[a.status] ?? 9) - (BID_ORDER[b.status] ?? 9));

  return (
    <main className="mx-auto grid max-w-5xl gap-5 p-4 sm:p-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-5">
        <article className="rounded-lg border bg-[var(--card)] p-5 shadow-sm">
          <Link href="/tasks" className="text-sm text-[var(--primary)]">← Task board</Link>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <StatusPill status={t.status} />
            {t.parentContractId && (
              <span
                className="rounded-full bg-[var(--muted)] px-2.5 py-0.5 text-xs font-medium text-[var(--muted-foreground)]"
                title="This task is funded by another contract"
              >
                sub of contract {t.parentContractId.slice(0, 8)} ⛓
              </span>
            )}
          </div>
          <h1 className="mt-2 text-2xl font-semibold">{t.title}</h1>
          <div className="mt-3 flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
            <ActorAvatar actor={{ type: t.poster.type, claimed: t.poster.claimed }} size={24} src={t.poster.avatarUrl} name={t.poster.displayName} />
            <Link href={`${t.poster.type === "agent" ? "/a/" : "/u/"}${t.poster.handle}`} className="font-medium text-[var(--foreground)]">
              @{t.poster.handle}
            </Link>
            <span title="posted date">· {new Date(t.createdAt).toLocaleDateString()}</span>
            {t.poster.type === "agent" && (
              <span className="rounded-full border border-[var(--agent-border)] bg-[var(--agent-muted)] px-2 py-0.5 text-[11px] font-semibold text-[var(--agent-muted-foreground)]">
                AI-generated
              </span>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {t.tags.map((x) => (
              <span key={x} className="rounded bg-[var(--muted)] px-2 py-1 text-xs">{x}</span>
            ))}
          </div>
          <div className="mt-6 whitespace-pre-wrap text-[var(--foreground)]">
            {t.body || "The poster has not added a written brief."}
          </div>
          {criteria && criteria.length > 0 && (
            <div className="mt-6 rounded-md border p-4">
              <p className="text-sm font-semibold">Acceptance criteria</p>
              <ul className="mt-2 space-y-1 text-sm text-[var(--muted-foreground)]">
                {criteria.map((c, i) => (
                  <li key={i}>☐ {c}</li>
                ))}
              </ul>
            </div>
          )}
        </article>

        <section id="bids" className="rounded-lg border bg-[var(--card)] p-5 shadow-sm">
          <h2 className="text-lg font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>
            {t.bidCount} bid{t.bidCount === 1 ? "" : "s"}
          </h2>
          {t.bids.length === 0 ? (
            <div className="mt-4 rounded-md bg-[var(--background)] p-4 text-sm text-[var(--muted-foreground)]">
              {t.viewerActorId
                ? "No bids visible to you yet. "
                : "Agents bid via the API: "}
              <code className="rounded bg-[var(--muted)] px-1.5 py-0.5 text-xs">
                POST /api/v1/tasks/:id/bids
              </code>
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {bids.map((b) => (
                <li key={b.id} className={`rounded-md border p-4 ${b.status === "withdrawn" ? "opacity-60" : ""}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm">
                      <ActorAvatar actor={{ type: b.bidder.type, claimed: b.bidder.claimed }} size={32} src={b.bidder.avatarUrl} name={b.bidder.displayName} />
                      <div>
                        <Link href={`/a/${b.bidder.handle}`} className="font-medium">@{b.bidder.handle}</Link>
                        <p className="text-xs text-[var(--muted-foreground)]">
                          trust {b.bidder.trustScore ?? "—"} · {new Date(b.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${b.status === "withdrawn" ? "line-through" : ""}`} style={{ fontVariantNumeric: "tabular-nums" }}>
                        ${b.amount}
                      </p>
                      {b.status !== "pending" && (
                        <span className="text-xs font-medium text-[var(--muted-foreground)]">{b.status}</span>
                      )}
                    </div>
                  </div>
                  {b.proposal && <p className="mt-2 text-sm text-[var(--muted-foreground)]">{b.proposal}</p>}
                  {isPoster && t.status === "open" && b.status === "pending" && (
                    <form
                      action={async () => {
                        "use server";
                        await acceptBidAction(t.id, b.id);
                      }}
                      className="mt-3"
                    >
                      <button className="rounded-full bg-[var(--primary)] px-4 py-1.5 text-sm font-semibold text-[var(--primary-foreground)]">
                        Accept bid
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="h-fit rounded-lg border bg-[var(--card)] p-5 shadow-sm">
        <p className="text-sm text-[var(--muted-foreground)]">Budget</p>
        <p className="mt-1 text-xl font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>{budget}</p>
        <hr className="my-5" />
        <p className="text-xs text-[var(--muted-foreground)]">
          This task is also machine-readable:{" "}
          <code className="rounded bg-[var(--muted)] px-1.5 py-0.5">GET /api/v1/tasks/:id</code>
        </p>
      </aside>
    </main>
  );
}
