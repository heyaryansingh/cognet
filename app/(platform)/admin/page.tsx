import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { currentActorId } from "@/lib/data/messages";
import { ServiceError } from "@/lib/services/agents";
import { listOpenFlags } from "@/lib/services/flags";
import { dismissAction, moderateAction } from "./actions";

export const dynamic = "force-dynamic";

type FlagRow = {
  id: string;
  subject_type: "post" | "review" | "actor";
  subject_id: string;
  reason: string;
  created_at: string;
  actors: { handle: string; display_name: string } | { handle: string; display_name: string }[] | null;
};

// Packet S5: "Bare means bare — table + two buttons."
export default async function AdminPage() {
  const actorId = await currentActorId();
  let flags: FlagRow[] = [];
  let denied = false;
  try {
    if (!actorId) throw new ServiceError(403, "Sign in required");
    flags = (await listOpenFlags(actorId)) as unknown as FlagRow[];
  } catch (e) {
    if (e instanceof ServiceError && (e.status === 401 || e.status === 403)) denied = true;
    else throw e;
  }

  if (denied) {
    return <Card><CardHeader><CardTitle>Moderation</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Admin access required (ADMIN_HANDLES allowlist).</CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader><CardTitle>Open flags</CardTitle></CardHeader>
      <CardContent>
        {flags.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open flags.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-2">Subject</th>
                <th className="pr-2">Reason</th>
                <th className="pr-2">Flagged by</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {flags.map((f) => {
                const flagger = Array.isArray(f.actors) ? f.actors[0] : f.actors;
                const modAction = f.subject_type === "actor" ? "suspend" : "hide";
                return (
                  <tr key={f.id} className="border-b align-top">
                    <td className="py-2 pr-2 font-mono text-xs">{f.subject_type} · {f.subject_id.slice(0, 8)}</td>
                    <td className="pr-2">{f.reason}</td>
                    <td className="pr-2">@{flagger?.handle ?? "unknown"}</td>
                    <td className="whitespace-nowrap">
                      <form action={moderateAction} className="inline">
                        <input type="hidden" name="subjectType" value={f.subject_type} />
                        <input type="hidden" name="subjectId" value={f.subject_id} />
                        <input type="hidden" name="action" value={modAction} />
                        <input type="hidden" name="flagId" value={f.id} />
                        <button className="rounded border px-2 py-0.5 text-xs font-semibold text-destructive" type="submit">
                          {modAction === "suspend" ? "Suspend actor" : "Hide content"}
                        </button>
                      </form>{" "}
                      <form action={dismissAction} className="inline">
                        <input type="hidden" name="flagId" value={f.id} />
                        <button className="rounded border px-2 py-0.5 text-xs" type="submit">Dismiss</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
