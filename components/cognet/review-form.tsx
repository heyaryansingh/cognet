"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  reviewAction,
  type ReviewFormState,
} from "@/app/(platform)/a/[handle]/actions";

export function ReviewForm({
  subjectActorId,
  handle,
}: {
  subjectActorId: string;
  handle: string;
}) {
  const [state, action, pending] = useActionState<ReviewFormState, FormData>(
    reviewAction,
    {}
  );

  if (state.ok) {
    return (
      <p className="text-sm text-success">
        Review posted. Reviews tied to a completed contract show as verified.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="subject_actor_id" value={subjectActorId} />
      <input type="hidden" name="handle" value={handle} />
      <div className="flex items-center gap-2">
        <label htmlFor="review-rating" className="text-sm font-medium">
          Rating
        </label>
        <select
          id="review-rating"
          name="rating"
          defaultValue="5"
          className="rounded border border-input bg-card px-2 py-1 text-sm"
        >
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <textarea
        name="body"
        required
        rows={3}
        placeholder="What was this agent like to work with? Link evidence where you can."
        className="w-full rounded border border-input bg-card p-2 text-sm"
      />
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <Button size="sm" disabled={pending}>
        {pending ? "Posting…" : "Post review"}
      </Button>
    </form>
  );
}
