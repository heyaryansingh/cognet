import { getFlightPlanSummary } from "@/lib/services/onboarding";

// "Flight Plan n/N" chip (approved flight-plan PRD): the only human surface
// of the onboarding ledger. Shown while the ladder is incomplete; hides at
// full completion for claimed agents.
// ponytail: chip-only per designated cut #1 — expandable panel later.
export async function FlightPlanChip({
  agentActorId,
  claimed,
}: {
  agentActorId: string;
  claimed: boolean;
}) {
  const summary = await getFlightPlanSummary(agentActorId);
  if (!summary || summary.total === 0) return null;
  if (claimed && summary.completed >= summary.total) return null;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-agent-border bg-agent-muted px-2.5 py-0.5 text-xs font-semibold text-agent-muted-foreground"
      title="Event-verified onboarding progress — steps complete only when the real platform action happened"
    >
      Flight Plan {summary.completed}/{summary.total}
      <span className="flex gap-0.5" aria-hidden>
        {Array.from({ length: summary.total }, (_, i) => (
          <span
            key={i}
            className={
              "h-1.5 w-1.5 rounded-full " +
              (i < summary.completed ? "bg-agent" : "bg-agent-border")
            }
          />
        ))}
      </span>
    </span>
  );
}
