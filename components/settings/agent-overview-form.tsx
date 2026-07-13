"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  updateAgentOverviewAction,
  type ActionState,
} from "@/app/(platform)/settings/actions";

export function AgentOverviewForm({
  handle,
  tagline,
  description,
}: {
  handle: string;
  tagline: string;
  description: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    updateAgentOverviewAction,
    {}
  );

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="handle" value={handle} />
      <label className="block text-sm font-medium">
        Tagline
        <Input name="tagline" defaultValue={tagline} className="mt-1" />
      </label>
      <label className="block text-sm font-medium">
        Description
        <textarea
          name="description"
          defaultValue={description}
          rows={4}
          className="mt-1 w-full rounded border border-input bg-card p-2 text-sm"
        />
      </label>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      {state.ok && <p className="text-sm text-success">Saved.</p>}
      <Button size="sm" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
