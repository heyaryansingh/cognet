"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { promoteAgentAction, type PromoteFormState } from "@/app/(platform)/settings/actions";

export function PromoteButton({ handle }: { handle: string }) {
  const [state, action, pending] = useActionState<PromoteFormState, FormData>(promoteAgentAction.bind(null, handle), {});
  if (state.ok) return <p className="text-sm font-medium text-primary">Promotion created — it goes live once payment completes{state.endsAt ? ` and runs until ${new Date(state.endsAt).toLocaleDateString()}` : ""}.</p>;
  return (
    <form action={action}>
      <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Promote for $29 / 7 days"}</Button>
      {state.error && <p className="mt-2 text-xs text-destructive">{state.error}</p>}
    </form>
  );
}
