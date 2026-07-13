import { Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ActorAvatar } from "@/components/actor-avatar";
import { listReviews } from "@/lib/services/reviews";

// Reviews section for /a/[handle] (S9): ReviewSplit header per
// COMPONENT_SPECS — human and agent averages NEVER blended — plus review
// cards with verified-hire vs unverified labels (contract_id presence).

type ReviewRow = {
  id: string;
  reviewer_actor_id: string;
  rating: number;
  body: string;
  ai_generated: boolean;
  contract_id: string | null;
  created_at: string;
  actors: {
    handle: string;
    display_name: string;
    avatar_url: string | null;
    type: "human" | "agent" | "org";
  } | null;
};

function mean(rows: ReviewRow[]): string {
  if (rows.length === 0) return "—";
  return (rows.reduce((s, r) => s + r.rating, 0) / rows.length).toFixed(1);
}

function SplitCol({ label, rows }: { label: string; rows: ReviewRow[] }) {
  return (
    <div className="flex-1 px-4 py-3 text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 flex items-center justify-center gap-1 text-2xl font-bold tabular-nums">
        {mean(rows)}
        <Star className="size-4 fill-star text-star" />
      </p>
      <p className="text-xs text-muted-foreground">
        {rows.length} review{rows.length === 1 ? "" : "s"}
      </p>
    </div>
  );
}

export async function ProfileReviews({ subjectActorId }: { subjectActorId: string }) {
  const { items } = await listReviews(null, subjectActorId, { limit: 20 });
  const rows = items as unknown as ReviewRow[];
  const humanRows = rows.filter((r) => !r.ai_generated);
  const agentRows = rows.filter((r) => r.ai_generated);

  return (
    <Card>
      <CardContent>
        <h2 className="font-semibold">Reviews</h2>
        <div className="mt-3 flex divide-x rounded-md border">
          <SplitCol label="From humans" rows={humanRows} />
          <SplitCol label="From agents" rows={agentRows} />
        </div>
        <div className="mt-4 space-y-4">
          {rows.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No reviews yet. Reviews from verified hires carry the most weight.
            </p>
          )}
          {rows.map((r) => (
            <div key={r.id} className="border-t pt-3 first:border-t-0">
              <div className="flex items-center gap-2">
                {r.actors && (
                  <ActorAvatar
                    size={24}
                    actor={{ type: r.actors.type, claimed: true }}
                    src={r.actors.avatar_url}
                    name={r.actors.display_name}
                  />
                )}
                <span className="text-sm font-semibold">
                  {r.actors?.display_name ?? "Member"}
                </span>
                <span className="flex items-center gap-0.5 text-sm font-bold tabular-nums">
                  {r.rating}
                  <Star className="size-3.5 fill-star text-star" />
                </span>
                {r.contract_id ? (
                  <span className="rounded-full bg-success-muted px-2 py-0.5 text-[11px] font-semibold text-success">
                    Verified hire
                  </span>
                ) : (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    Unverified
                  </span>
                )}
                <span className="ml-auto text-xs text-text-tertiary">
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6">{r.body}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
