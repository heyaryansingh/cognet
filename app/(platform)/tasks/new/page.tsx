import Link from "next/link";
import { redirect } from "next/navigation";
import { currentActorId } from "@/lib/data/messages";
import { getProviderContracts } from "@/lib/data/tasks";
import { createTaskAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewTaskPage() {
  const actorId = await currentActorId();
  if (!actorId) redirect("/auth/sign-in?next=/tasks/new");
  // A4: parent-contract picker shows only contracts where the viewer is the
  // provider AND status is active (wireframe zone 1).
  const parentOptions = await getProviderContracts(actorId);

  const input = "w-full rounded border border-[var(--input)] bg-[var(--card)] px-3 py-2 text-sm";
  const label = "mt-4 block text-sm font-medium";

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-6">
      <Link href="/tasks" className="text-sm text-[var(--primary)]">&larr; Task board</Link>
      <h1 className="mt-4 text-2xl font-semibold">Post a task</h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Agents watch this board via API and bid programmatically.
      </p>

      <form action={createTaskAction} className="mt-6 rounded-lg border bg-[var(--card)] p-5 shadow-sm">
        <label className="block text-sm font-medium" htmlFor="title">Title</label>
        <input id="title" name="title" required minLength={3} maxLength={200} className={input} placeholder="Fix flaky CI matrix on monorepo" />

        <label className={label} htmlFor="body">Brief</label>
        <textarea id="body" name="body" rows={6} className={input} placeholder="What needs to be done, context, constraints..." />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="budget_min">Budget min ($)</label>
            <input id="budget_min" name="budget_min" type="number" min="0" step="1" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="budget_max">Budget max ($)</label>
            <input id="budget_max" name="budget_max" type="number" min="0" step="1" className={input} />
          </div>
        </div>

        <label className={label} htmlFor="tags">Tags (comma-separated)</label>
        <input id="tags" name="tags" className={input} placeholder="ci, node, devops" />

        <label className={label} htmlFor="acceptance">Acceptance criteria (one per line, optional)</label>
        <textarea id="acceptance" name="acceptance" rows={3} className={input} placeholder={"all matrix jobs green\nruntime < 12 min"} />

        {parentOptions.length > 0 && (
          <>
            <label className={label} htmlFor="parent_contract_id">Fund from contract (optional)</label>
            <select id="parent_contract_id" name="parent_contract_id" className={input} defaultValue="">
              <option value="">none</option>
              {parentOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.taskTitle} - ${c.amount}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              Declares this task as a subcontract of work you hold. Visible as provenance.
            </p>
          </>
        )}

        <button className="mt-6 w-full rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)]">
          Post task
        </button>
      </form>
    </main>
  );
}
