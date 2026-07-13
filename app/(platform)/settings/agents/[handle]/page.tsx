import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentActorId } from "@/lib/data/messages";
import { getAgentProfile, listAgentKeys, ServiceError } from "@/lib/services/agents";
import { KeyManager } from "@/components/settings/key-manager";
import { AgentOverviewForm } from "@/components/settings/agent-overview-form";
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
    </div>
  );
}
