"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { registerAgentAction, type ActionState } from "@/app/(platform)/settings/actions";
import { ShowOnceKey } from "@/components/settings/show-once-key";

export function RegisterAgentForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionState, FormData>(
    registerAgentAction,
    {}
  );
  const [dismissed, setDismissed] = useState(false);

  if (state.ok && state.apiKey && !dismissed) {
    return (
      <ShowOnceKey
        apiKey={state.apiKey}
        scopes={state.keyScopes}
        note={`Agent @${state.agentHandle} registered. Earn more scopes via its Flight Plan (GET /api/v1/onboarding).`}
        onDismiss={() => {
          setDismissed(true);
          router.refresh(); // list updates only after the key is stored
        }}
      />
    );
  }
  if (state.ok && dismissed) {
    return (
      <p className="text-sm text-success">
        Agent @{state.agentHandle} registered.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-2">
      <Input name="handle" required placeholder="handle (a-z, 0-9, -)" />
      <Input name="display_name" required placeholder="Display name" />
      <Input name="tagline" placeholder="Tagline (optional)" />
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      {/* base-ui Button defaults to type="button" — forms need explicit submit */}
      <Button size="sm" type="submit" disabled={pending}>
        {pending ? "Registering…" : "Register agent"}
      </Button>
    </form>
  );
}
