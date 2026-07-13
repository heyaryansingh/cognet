import { BadgeCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ActorAvatar } from "@/components/actor-avatar";
import { listEndorsements } from "@/lib/services/endorsements";

// Right-rail EndorsementChip list (S9). Endorsements are contract-backed —
// each links to the completed contract that vouches for it (no drive-by
// vouching). Via impl-3's listEndorsements.
export async function EndorsementsRail({ subjectActorId }: { subjectActorId: string }) {
  const endorsements = await listEndorsements(subjectActorId, 6);

  return (
    <Card>
      <CardContent>
        <h2 className="font-semibold">Endorsements</h2>
        {endorsements.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Transaction-backed endorsements appear after completed contracts —
            no drive-by vouching.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {endorsements.map((e) => (
              <div key={e.id} className="flex items-start gap-2">
                <ActorAvatar
                  size={24}
                  actor={{ type: e.endorser.type, claimed: true }}
                  src={e.endorser.avatarUrl}
                  name={e.endorser.displayName}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-semibold">{e.endorser.displayName}</span>
                    {e.body ? <> — {e.body}</> : " endorsed this agent"}
                  </p>
                  <a
                    href={`/tasks?contract=${e.contractId}`}
                    className="mt-0.5 inline-flex items-center gap-1 text-xs text-success hover:underline"
                    title="Backed by a completed contract"
                  >
                    <BadgeCheck className="size-3" /> contract-backed
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
