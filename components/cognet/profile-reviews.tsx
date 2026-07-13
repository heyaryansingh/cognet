import { Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ActorAvatar } from "@/components/actor-avatar";
import {
  getVisibleReviews,
  getReviewSplit,
  type ProfileReview,
} from "@/lib/data/reviews";

// Reviews section for /a/[handle] (S9): ReviewSplit header per
// COMPONENT_SPECS — human and agent averages NEVER blended — plus review
// cards with verified-hire vs unverified labels. Data via impl-2's
// RLS-client helpers (their handoff spec).

function SplitCol({
  label,
  avg,
  count,
}: {
  label: string;
  avg: number | null;
  count: number;
}) {
  return (
    <div className="flex-1 px-4 py-3 text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 flex items-center justify-center gap-1 text-2xl font-bold tabular-nums">
        {avg ?? "—"}
        <Star className="size-4 fill-star text-star" />
      </p>
      <p className="text-xs text-muted-foreground">
        {count} review{count === 1 ? "" : "s"}
      </p>
    </div>
  );
}

function ReviewCard({ r }: { r: ProfileReview }) {
  return (
    <div className="border-t pt-3 first:border-t-0">
      <div className="flex items-center gap-2">
        {r.reviewer && (
          <ActorAvatar
            size={24}
            actor={{ type: r.reviewer.type, claimed: true }}
            src={r.reviewer.avatar_url}
            name={r.reviewer.display_name}
          />
        )}
        <span className="text-sm font-semibold">
          {r.reviewer?.display_name ?? "Member"}
        </span>
        <span className="flex items-center gap-0.5 text-sm font-bold tabular-nums">
          {r.rating}
          <Star className="size-3.5 fill-star text-star" />
        </span>
        {r.verified ? (
          <span className="rounded-full bg-success-muted px-2 py-0.5 text-[11px] font-semibold text-success">
            Verified hire
          </span>
        ) : (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            Unverified
          </span>
        )}
        {r.ai_generated && (
          <span className="rounded-full border border-agent-border bg-agent-muted px-2 py-0.5 text-[10.5px] font-semibold text-agent-muted-foreground">
            AI-generated
          </span>
        )}
        <span className="ml-auto text-xs text-text-tertiary">
          {new Date(r.created_at).toLocaleDateString()}
        </span>
      </div>
      <p className="mt-2 text-sm leading-6">{r.body}</p>
    </div>
  );
}

export async function ProfileReviews({ subjectActorId }: { subjectActorId: string }) {
  const [reviews, split] = await Promise.all([
    getVisibleReviews(subjectActorId, 20),
    getReviewSplit(subjectActorId),
  ]);

  return (
    <Card>
      <CardContent>
        <h2 className="font-semibold">Reviews</h2>
        <div className="mt-3 flex divide-x rounded-md border">
          <SplitCol label="From humans" avg={split.human.avg} count={split.human.count} />
          <SplitCol label="From agents" avg={split.ai.avg} count={split.ai.count} />
        </div>
        <div className="mt-4 space-y-4">
          {reviews.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No reviews yet. Reviews from verified hires carry the most weight.
            </p>
          )}
          {reviews.map((r) => (
            <ReviewCard key={r.id} r={r} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
