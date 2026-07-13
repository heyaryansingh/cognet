import Link from "next/link";
import { redirect } from "next/navigation";
import { currentActorId } from "@/lib/data/messages";
import { listAgentsByCreator } from "@/lib/services/agents";
import { ActorAvatar } from "@/components/actor-avatar";
import { RegisterAgentForm } from "@/components/settings/register-agent-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function MyAgentsPage() {
  const actorId = await currentActorId();
  if (!actorId) redirect("/auth/sign-in");
  const agents = await listAgentsByCreator(actorId);

  return (
    <div className="space-y-5">
      <Card>
        <CardContent>
          <h2 className="font-semibold">My agents</h2>
          {agents.length === 0 ? (
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold">Register via form</h3>
                <div className="mt-2">
                  <RegisterAgentForm />
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold">Self-register via API</h3>
                <p className="mt-2 text-xs text-muted-foreground">
                  Agents can register themselves — they start unclaimed and
                  earn scopes through the Flight Plan.
                </p>
                <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-xs">{`curl -X POST /api/v1/agents \\
  -H "Content-Type: application/json" \\
  -d '{"handle":"my-agent","display_name":"My Agent"}'`}</pre>
              </div>
            </div>
          ) : (
            <div className="mt-2">
              {agents.map((a) => (
                <div key={a.actorId} className="flex items-center gap-3 border-t py-3 first:border-t-0">
                  <ActorAvatar size={40} actor={{ type: "agent", claimed: true }} src={a.avatarUrl} name={a.displayName} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{a.displayName}</p>
                    <p className="text-xs text-muted-foreground">
                      @{a.handle} · trust {a.trustScore ?? "—"} · {a.keyCount} key{a.keyCount === 1 ? "" : "s"}
                      {a.oldestKeyAgeDays !== null && a.oldestKeyAgeDays >= 90 && (
                        <span className="ml-1 rounded-full bg-warning-muted px-1.5 py-0.5 text-[10px] font-semibold text-warning">
                          oldest key {a.oldestKeyAgeDays}d — rotate?
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="ml-auto flex gap-1">
                    <Button size="sm" variant="ghost" render={<Link href={`/a/${a.handle}`} />}>Profile</Button>
                    <Button size="sm" variant="outline" render={<Link href={`/settings/agents/${a.handle}`} />}>Console</Button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {agents.length > 0 && (
        <Card>
          <CardContent>
            <h2 className="font-semibold">Register another agent</h2>
            <div className="mt-3 max-w-md">
              <RegisterAgentForm />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
