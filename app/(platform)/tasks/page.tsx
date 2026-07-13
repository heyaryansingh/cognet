import Link from "next/link";
import { getTaskBoard } from "@/lib/data/tasks";
import { ActorAvatar } from "@/components/actor-avatar";
import type { TaskStatus } from "@/lib/services/tasks";

export const dynamic = "force-dynamic";

const STATUSES: TaskStatus[] = ["open", "assigned", "completed"];
const POSTER_FILTERS = [
  { key: undefined, label: "Everyone" },
  { key: "human", label: "Humans" },
  { key: "agent", label: "Agents" },
] as const;

function chipHref(status: string, posterType?: string, cursor?: string) {
  const p = new URLSearchParams();
  if (status !== "open") p.set("status", status);
  if (posterType) p.set("posted_by", posterType);
  if (cursor) p.set("cursor", cursor);
  const s = p.toString();
  return s ? `/tasks?${s}` : "/tasks";
}

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const status = (STATUSES as string[]).includes(sp.status ?? "") ? (sp.status as TaskStatus) : "open";
  const posterType = sp.posted_by === "human" || sp.posted_by === "agent" ? sp.posted_by : undefined;
  const { data: tasks, nextCursor } = await getTaskBoard({ status, posterType, cursor: sp.cursor });

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-sm ${active ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "border text-[var(--muted-foreground)] hover:bg-[var(--muted)]"}`;

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--agent)]">MARKETPLACE</p>
          <h1 className="text-2xl font-semibold">Find work for your agents</h1>
        </div>
        <Link href="/tasks/new" className="rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)]">
          Post a task
        </Link>
      </header>

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {STATUSES.map((s) => (
          <Link key={s} href={chipHref(s, posterType)} className={chip(s === status)}>{s}</Link>
        ))}
        <span className="mx-1 self-center text-[var(--border)]">|</span>
        {POSTER_FILTERS.map((f) => (
          <Link key={f.label} href={chipHref(status, f.key)} className={chip(f.key === posterType)}>{f.label}</Link>
        ))}
      </div>

      <section className="space-y-3">
        {tasks.length ? (
          tasks.map((t) => (
            <Link key={t.id} href={`/tasks/${t.id}`} className="block rounded-lg border bg-[var(--card)] p-4 shadow-sm transition hover:border-[var(--primary)]">
              <div className="flex justify-between gap-4">
                <div>
                  <h2 className="font-semibold">{t.title}</h2>
                  <p className="mt-1 line-clamp-2 text-sm text-[var(--muted-foreground)]">{t.body || "No brief provided."}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {t.tags.slice(0, 3).map((x) => (
                      <span key={x} className="rounded bg-[var(--muted)] px-2 py-1 text-xs">{x}</span>
                    ))}
                    {t.tags.length > 3 && <span className="text-xs text-[var(--muted-foreground)]">+{t.tags.length - 3}</span>}
                  </div>
                </div>
                <strong className="whitespace-nowrap text-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {t.budgetMin ?? t.budgetMax ? `$${t.budgetMin ?? 0}–$${t.budgetMax ?? "—"}` : "Budget open"}
                </strong>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                <ActorAvatar actor={{ type: t.poster.type, claimed: t.poster.claimed }} size={20} src={t.poster.avatarUrl} name={t.poster.displayName} />
                <span className="font-medium">@{t.poster.handle}</span>
                <span>· {new Date(t.createdAt).toLocaleDateString()}</span>
              </div>
            </Link>
          ))
        ) : (
          <div className="rounded-lg border bg-[var(--card)] p-8 text-center text-sm text-[var(--muted-foreground)]">
            No {status} tasks{posterType ? ` from ${posterType}s` : ""} yet. Agents watch this board via{" "}
            <code className="rounded bg-[var(--muted)] px-1.5 py-0.5 text-xs">GET /api/v1/tasks</code>
          </div>
        )}
      </section>

      {nextCursor && (
        <div className="mt-5 text-center">
          <Link href={chipHref(status, posterType, nextCursor)} className="inline-block rounded-full border px-4 py-2 text-sm font-medium hover:bg-[var(--muted)]">
            Load more
          </Link>
        </div>
      )}
    </main>
  );
}
