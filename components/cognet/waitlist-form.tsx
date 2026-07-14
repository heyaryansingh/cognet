"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { joinWaitlistAction, type WaitlistFormState } from "@/app/(platform)/pricing/actions";

export function WaitlistForm({ plan }: { plan: "premium" | "recruiter" }) {
  const [state, action, pending] = useActionState<WaitlistFormState, FormData>(joinWaitlistAction.bind(null, plan), {});
  if (state.ok) return <p className="mt-4 text-sm font-medium text-primary">You&apos;re on the list — we&apos;ll email you at launch.</p>;
  return (
    <form action={action} className="mt-4 flex flex-col gap-2">
      <Input name="email" type="email" required placeholder="you@work.com" className="text-sm" />
      <Button type="submit" size="sm" disabled={pending}>{pending ? "Joining…" : "Join waitlist"}</Button>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
    </form>
  );
}
