"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { hireAction, type HireFormState } from "@/app/(platform)/a/[handle]/actions";

// HireModal (COMPONENT_SPECS): overlay, Scope -> Terms -> Review. Terms echo
// the agent's published pricing. M1 is payment-off-platform; CTA is
// "Send hire request", never "Pay". Wired to impl-3's hireAgent.
export function HireModal({
  agentActorId,
  agentName,
  pricing,
}: {
  agentActorId: string;
  agentName: string;
  pricing: Record<string, unknown>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [state, action, pending] = useActionState<HireFormState, FormData>(
    hireAction.bind(null, agentActorId),
    {}
  );

  useEffect(() => {
    if (state.redirectTo) router.push(state.redirectTo);
  }, [state.redirectTo, router]);

  const pricingLines = Object.entries(pricing).filter(
    ([, v]) => typeof v === "string" || typeof v === "number"
  );

  return (
    <>
      <Button onClick={() => setOpen(true)}>Hire</Button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-[560px] rounded-lg bg-card p-5 shadow-[var(--elevation-overlay)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Hire {agentName}</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="mt-1 flex gap-1 text-xs text-muted-foreground">
              {["Scope", "Terms", "Review"].map((s, i) => (
                <span
                  key={s}
                  className={step === i + 1 ? "font-semibold text-primary" : ""}
                >
                  {i > 0 && "· "}
                  {s}
                </span>
              ))}
            </div>

            <form
              action={action}
              onSubmit={(e) => {
                // never submit before the Review step, whatever fires it
                if (step !== 3) e.preventDefault();
              }}
              className="mt-4 space-y-3"
            >
              {/* all fields stay mounted across steps so one submit carries them */}
              <div className={step === 1 ? "space-y-3" : "hidden"}>
                <label className="block text-sm font-medium">
                  What do you need done?
                  <Input name="title" required placeholder="e.g. Summarize these 40 papers" className="mt-1" />
                </label>
                <label className="block text-sm font-medium">
                  Scope / details (optional)
                  <textarea
                    name="scope"
                    rows={3}
                    placeholder="Deliverables, constraints, deadline…"
                    className="mt-1 w-full rounded border border-input bg-card p-2 text-sm"
                  />
                </label>
              </div>

              <div className={step === 2 ? "space-y-3" : "hidden"}>
                <div className="rounded-md bg-background p-3 text-sm">
                  <p className="font-semibold">Published pricing</p>
                  {pricingLines.length ? (
                    <ul className="mt-1 space-y-0.5 text-muted-foreground">
                      {pricingLines.map(([k, v]) => (
                        <li key={k} className="font-mono text-xs">
                          {k}: {String(v)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      No pricing published — agree a budget below.
                    </p>
                  )}
                </div>
                <label className="block text-sm font-medium">
                  Your budget (USD)
                  <Input name="amount" type="number" min="0" step="0.01" required defaultValue="0" className="mt-1" />
                </label>
              </div>

              <div className={step === 3 ? "space-y-2" : "hidden"}>
                <p className="rounded-md bg-background p-3 text-sm text-muted-foreground">
                  This sends a hire request and opens a direct conversation with{" "}
                  {agentName}. <strong className="text-foreground">Payment is
                  handled off-platform at M1</strong> — Cognet records the
                  contract; you settle payment directly.
                </p>
              </div>

              {state.error && <p className="text-sm text-danger">{state.error}</p>}

              <div className="flex justify-between pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => (step === 1 ? setOpen(false) : setStep((s) => (s - 1) as 1 | 2 | 3))}
                >
                  {step === 1 ? "Cancel" : "Back"}
                </Button>
                {step < 3 ? (
                  <Button type="button" onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}>
                    Next
                  </Button>
                ) : (
                  <Button type="submit" disabled={pending}>
                    {pending ? "Sending…" : "Send hire request"}
                  </Button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
