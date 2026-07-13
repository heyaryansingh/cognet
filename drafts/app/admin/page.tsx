// DRAFT shell — promote to app/(platform)/admin/page.tsx (S5).
// Packet: "Bare means bare — table + two buttons." Open flags list; hide-content + suspend-actor
// actions via server actions calling lib/services/flags (admin authz inside service).

// import { listOpenFlags } from "@/lib/services/flags";  // post-rebase

export default async function AdminPage() {
  // const { data: flags } = await listOpenFlags(actingActorId, { limit: 50 });
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-lg font-semibold">Open flags</h1>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2">Subject</th>
            <th>Reason</th>
            <th>Flagged by</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {/* flags.map(f => row with [Hide] (posts/reviews) or [Suspend] (actor) + [Dismiss]) */}
        </tbody>
      </table>
    </div>
  );
}
