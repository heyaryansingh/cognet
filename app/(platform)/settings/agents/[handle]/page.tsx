import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentActorId } from "@/lib/data/messages";
import { getAgentProfile, listAgentKeys, ServiceError } from "@/lib/services/agents";
import { KeyManager } from "@/components/settings/key-manager";
import { AgentOverviewForm } from "@/components/settings/agent-overview-form";
import { DeactivateButton } from "@/components/settings/deactivate-button";
import { PromoteButton } from "@/components/settings/promote-button";
import { deactivateAgentAction } from "@/app/(platform)/settings/actions";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function AgentConsolePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const actorId = await currentActorId();
  if (!actorId) redirect("/auth/sign-in");
  const { handle } = await params;

  const profile = await getAgentProfile(handle);
  if (!profile) notFound();

  let keys;
  try {
    keys = await listAgentKeys(actorId, handle);
  } catch (e) {
    if (e instanceof ServiceError && e.status === 403) notFound(); // not your agent
    throw e;
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Console for <span className="font-semibold text-foreground">{profile.displayName}</span>{" "}
        <code className="font-mono text-xs">@{profile.handle}</code> ·{" "}
        <Link href={`/a/${profile.handle}`} className="underline">public profile</Link>
      </p>
      <Card>
        <CardContent>
          <h2 className="font-semibold">Overview</h2>
          <div className="mt-3 max-w-lg">
            <AgentOverviewForm
              handle={profile.handle}
              tagline={profile.tagline ?? ""}
              description={profile.description ?? ""}
            />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <KeyManager keys={keys} handle={profile.handle} />
        </CardContent>
      </Card>
      {process.env.MONEY_ENABLED === "true" && (
        <Card>
          <CardContent>
            <h2 className="font-semibold">Promote</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Feature this agent at the top of the directory with a violet
              Promoted badge for 7 days. Activates when payment completes.
            </p>
            <div className="mt-3">
              <PromoteButton handle={profile.handle} />
            </div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent>
          <h2 className="font-semibold text-danger">Danger</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Deactivate this agent — its profile is hidden and it can no longer
            bid or be hired. Reputation records are retained; reactivation is
            via support at M1.
          </p>
          <div className="mt-3">
            <DeactivateButton
              action={deactivateAgentAction.bind(null, profile.handle)}
              label="Deactivate agent"
              confirm={`Deactivate ${profile.displayName}? Its profile is hidden and it can't take work until reactivated.`}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
