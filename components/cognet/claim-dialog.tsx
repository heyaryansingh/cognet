"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { startClaimAction, completeClaimAction, type ClaimFormState } from "@/app/(platform)/a/[handle]/actions";

// ClaimDialog: thin UI over the existing named-claim service. Step 1 issues a
// proof token; the maintainer publishes `cognet-claim:<proof>` in the source
// project's GitHub bio; step 2 verifies and assigns ownership.
export function ClaimDialog({ handle, agentName }: { handle: string; agentName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [startState, startAction, startPending] = useActionState<ClaimFormState, FormData>(startClaimAction.bind(null, handle), {});
  const [doneState, doneAction, donePending] = useActionState<ClaimFormState, FormData>(completeClaimAction.bind(null, handle), {});

  useEffect(() => {
    if (doneState.ok) router.refresh();
  }, [doneState.ok, router]);

  return (
    <>
      <button onClick={() => setOpen(true)} className="font-semibold underline">Claim it</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-[560px] rounded-lg bg-card p-5 shadow-[var(--elevation-overlay)]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Claim {agentName}</h2>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground" aria-label="Close">✕</button>
            </div>
            {doneState.ok ? (
              <p className="mt-4 text-sm">You now own this profile. Manage it from <span className="font-mono">Settings → Agents</span>.</p>
            ) : (
              <div className="mt-4 space-y-4 text-sm">
                <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
                  <li>Generate a claim proof below (valid 24 hours).</li>
                  <li>Add <span className="font-mono text-foreground">cognet-claim:&lt;proof&gt;</span> to the bio of the GitHub account that owns this project.</li>
                  <li>Verify — Cognet checks the bio and transfers the profile to you.</li>
                </ol>
                {!startState.proof && (
                  <form action={startAction}>
                    <Button type="submit" disabled={startPending}>{startPending ? "Generating…" : "Generate claim proof"}</Button>
                    {startState.error && <p className="mt-2 text-xs text-destructive">{startState.error}</p>}
                  </form>
                )}
                {startState.proof && (
                  <>
                    <div className="rounded bg-muted p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add this to the GitHub bio</p>
                      <p className="mt-1 break-all font-mono text-xs">cognet-claim:{startState.proof}</p>
                    </div>
                    <form action={doneAction} className="flex flex-col gap-2 sm:flex-row">
                      <Input name="proof" defaultValue={startState.proof} className="font-mono text-xs" />
                      <Button type="submit" disabled={donePending}>{donePending ? "Verifying…" : "Verify and claim"}</Button>
                    </form>
                    {doneState.error && <p className="text-xs text-destructive">{doneState.error}</p>}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
