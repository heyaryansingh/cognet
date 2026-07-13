import { cn } from "@/lib/utils";

// Canonical Claude Design identity system. Violet is reserved for agents.

export type ActorIdentity = {
  type: "human" | "agent" | "org";
  claimed?: boolean; // agents only: agents.creator_actor_id IS NOT NULL
};

export type ActorAvatarSize = 16 | 20 | 24 | 32 | 40 | 48 | 64 | 72 | 96;

function ariaLabelFor(actor: ActorIdentity): string {
  // fixed vocabulary — acceptance test 5
  if (actor.type === "human") return "Human";
  if (actor.type === "org") return "Organization";
  return actor.claimed ? "Agent" : "Agent (unclaimed profile)";
}

export function ActorTypeGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <g stroke="currentColor" strokeWidth="2.2" fill="currentColor">
        <line x1="12" y1="12" x2="12" y2="4.5" /><line x1="12" y1="12" x2="18.5" y2="16.5" /><line x1="12" y1="12" x2="5.5" y2="16.5" />
        <circle cx="12" cy="12" r="3.2" strokeWidth="0" /><circle cx="12" cy="4.5" r="2.2" strokeWidth="0" /><circle cx="18.5" cy="16.5" r="2.2" strokeWidth="0" /><circle cx="5.5" cy="16.5" r="2.2" strokeWidth="0" />
      </g>
    </svg>
  );
}

function AgentBadge({ size }: { size: ActorAvatarSize }) {
  if (size < 32) return <span aria-hidden className="absolute -right-[2px] -bottom-[2px] size-[10px] rounded-full border-[1.5px] border-card bg-agent" />;
  const badge = size >= 72 ? 26 : 18;
  return (
    <span aria-hidden className="absolute flex items-center justify-center border-2 border-card bg-agent text-agent-foreground" style={{ width: badge, height: badge, right: -3, bottom: -3, borderRadius: Math.round(badge * .32) }}>
      <ActorTypeGlyph className="size-[62%]" />
    </span>
  );
}

function initials(name: string) { const parts = name.trim().split(/\s+/).filter(Boolean); return parts.length < 2 ? (parts[0] ?? "?").slice(0, 2).toUpperCase() : `${parts[0][0]}${parts.at(-1)![0]}`.toUpperCase(); }

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
  const radius = actor.type === "human" ? "9999px" : isAgent ? "26%" : "12%";
  const monogramStyle = isAgent ? { background: "#EDE7FB", color: "var(--agent-deep)" } : { background: "#DCE5EF", color: "#3E5878" };
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
        ) : <span className="flex size-full items-center justify-center font-bold" style={{ ...monogramStyle, fontSize: Math.round(size * .4) }}>{initials(name)}</span>}
      </span>
      {isAgent && actor.claimed === false && <span aria-hidden className="pointer-events-none absolute -inset-[3px] border-2 border-dashed border-muted-foreground" style={{ borderRadius: "26%" }} />}
      {isAgent && <AgentBadge size={size} />}
    </span>
  );
}
