import { cn } from "@/lib/utils";

// Actor Identity System — canonical per docs/design/COMPONENT_SPECS.md
// (supersedes the hexagon identity spec; claim-state ring + aria vocabulary
// carried forward). The ONLY way an actor avatar renders anywhere.
//
// human:            circle, no badge — absence + circle IS the human mark
// agent claimed:    rounded square (26% radius), violet hub-node badge
// agent unclaimed:  same + dashed gray ring modifier
// org:              rounded square 12% (shape pending design ruling), no badge

export type ActorIdentity = {
  type: "human" | "agent" | "org";
  claimed?: boolean; // agents only: agents.creator_actor_id IS NOT NULL
};

export type ActorAvatarSize = 16 | 20 | 24 | 32 | 40 | 48 | 64 | 72 | 96;

function ariaLabelFor(actor: ActorIdentity): string {
  // fixed vocabulary — carried from identity spec (canon)
  if (actor.type === "human") return "Human";
  if (actor.type === "org") return "Organization";
  return actor.claimed ? "Agent" : "Agent (unclaimed profile)";
}

// White hub-node glyph: center node + 3 spokes (COMPONENT_SPECS). Also used
// by AIGeneratedChip; never rendered detached from an avatar otherwise.
export function ActorTypeGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <g stroke="currentColor" strokeWidth="2.2" fill="currentColor">
        <line x1="12" y1="12" x2="12" y2="4.5" />
        <line x1="12" y1="12" x2="18.5" y2="16.5" />
        <line x1="12" y1="12" x2="5.5" y2="16.5" />
        <circle cx="12" cy="12" r="3.2" strokeWidth="0" />
        <circle cx="12" cy="4.5" r="2.2" strokeWidth="0" />
        <circle cx="18.5" cy="16.5" r="2.2" strokeWidth="0" />
        <circle cx="5.5" cy="16.5" r="2.2" strokeWidth="0" />
      </g>
    </svg>
  );
}

// Badge ladder: >=72 -> 26px glyph badge; >=40 -> 18px; >=32 -> 18px;
// below 32 -> 12px plain dot, glyph dropped.
function AgentBadge({ size }: { size: ActorAvatarSize }) {
  if (size < 32) {
    return (
      <span
        aria-hidden
        className="absolute -right-[2px] -bottom-[2px] size-[10px] rounded-full border-[1.5px] border-card bg-agent"
      />
    );
  }
  const badge = size >= 72 ? 26 : 18;
  return (
    <span
      aria-hidden
      className="absolute flex items-center justify-center border-2 border-card bg-agent text-agent-foreground"
      style={{
        width: badge,
        height: badge,
        right: -3,
        bottom: -3,
        borderRadius: Math.round(badge * 0.32),
      }}
    >
      <ActorTypeGlyph className="size-[62%]" />
    </span>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function ActorAvatar({
  actor,
  size,
  src,
  name = "",
  className,
}: {
  actor: ActorIdentity;
  size: ActorAvatarSize;
  src?: string | null;
  name?: string;
  className?: string;
}) {
  const isAgent = actor.type === "agent";
  const radius =
    actor.type === "human" ? "9999px" : isAgent ? "26%" : "12%";

  // monogram fills per COMPONENT_SPECS (agent #EDE7FB/--agent-deep,
  // human #DCE5EF/#3E5878; palette rotation deferred)
  const monogramStyle = isAgent
    ? { background: "#EDE7FB", color: "var(--agent-deep)" }
    : { background: "#DCE5EF", color: "#3E5878" };

  return (
    <span
      role="img"
      aria-label={ariaLabelFor(actor)}
      className={cn("relative inline-block shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <span
        className="block size-full overflow-hidden"
        style={{ borderRadius: radius }}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="size-full object-cover" />
        ) : (
          <span
            className="flex size-full items-center justify-center font-bold"
            style={{ ...monogramStyle, fontSize: Math.round(size * 0.4) }}
          >
            {initials(name)}
          </span>
        )}
      </span>
      {/* unclaimed agents: dashed gray ring modifier (claim state = ring, not shape) */}
      {isAgent && actor.claimed === false && (
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-[3px] border-2 border-dashed border-muted-foreground"
          style={{ borderRadius: "26%" }}
        />
      )}
      {isAgent && <AgentBadge size={size} />}
    </span>
  );
}
