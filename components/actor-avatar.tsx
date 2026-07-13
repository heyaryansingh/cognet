import { useId } from "react";
import { Sparkle, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Actor Identity System — the ONLY way an actor avatar renders anywhere
// (identity spec 2026-07-13, approved). Shape carries meaning; color
// reinforces. Chrome is component-rendered, never bitmap-baked.
//
// human:            circle, no ring, no chip
// agent claimed:    rounded hexagon, solid accent ring, spark chip (>=32px)
// agent unclaimed:  rounded hexagon, dashed gray ring, desaturated chip
// org:              rounded square (12% radius), building chip (>=32px)

export type ActorIdentity = {
  type: "human" | "agent" | "org";
  claimed?: boolean; // agents only: agents.creator_actor_id IS NOT NULL
};

export type ActorAvatarSize = 16 | 20 | 24 | 32 | 40 | 64 | 96;

// Flat-top rounded hexagon path in objectBoundingBox units, corner radius
// ~18% of width (identity spec). Generated once at module load.
const AGENT_HEX_PATH = (() => {
  const verts: Array<[number, number]> = [
    [0.25, 0],
    [0.75, 0],
    [1, 0.5],
    [0.75, 1],
    [0.25, 1],
    [0, 0.5],
  ];
  const r = 0.13; // fraction of each edge cut for the rounded corner
  const pts = verts.map((v, i) => {
    const prev = verts[(i + verts.length - 1) % verts.length];
    const next = verts[(i + 1) % verts.length];
    const toward = (a: [number, number], b: [number, number]) => {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy);
      return [a[0] + (dx / len) * len * r, a[1] + (dy / len) * len * r] as const;
    };
    return { in: toward(v, prev), vertex: v, out: toward(v, next) };
  });
  let d = `M ${pts[0].in[0].toFixed(4)} ${pts[0].in[1].toFixed(4)}`;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const nextIn = pts[(i + 1) % pts.length].in;
    d += ` Q ${p.vertex[0].toFixed(4)} ${p.vertex[1].toFixed(4)} ${p.out[0].toFixed(4)} ${p.out[1].toFixed(4)}`;
    d += ` L ${nextIn[0].toFixed(4)} ${nextIn[1].toFixed(4)}`;
  }
  return d + " Z";
})();

function ariaLabelFor(actor: ActorIdentity): string {
  // fixed vocabulary — acceptance test 5
  if (actor.type === "human") return "Human";
  if (actor.type === "org") return "Organization";
  return actor.claimed ? "Agent" : "Agent (unclaimed profile)";
}

function Chip({
  actor,
  size,
}: {
  actor: ActorIdentity;
  size: ActorAvatarSize;
}) {
  if (size < 32 || actor.type === "human") return null;
  const chipSize = Math.max(12, Math.round(size * 0.4));
  const isAgent = actor.type === "agent";
  const Icon = isAgent ? Sparkle : Building2;
  return (
    <span
      aria-hidden
      className={cn(
        "absolute -right-0.5 -bottom-0.5 flex items-center justify-center rounded-full border-[1.5px] border-background",
        isAgent
          ? actor.claimed
            ? "bg-agent text-agent-foreground"
            : "bg-muted text-muted-foreground"
          : "bg-muted text-muted-foreground"
      )}
      style={{ width: chipSize, height: chipSize }}
    >
      <Icon style={{ width: chipSize * 0.62, height: chipSize * 0.62 }} />
    </span>
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <span className="flex size-full items-center justify-center bg-muted text-muted-foreground text-[0.55em] font-semibold uppercase">
      {label.slice(0, 2)}
    </span>
  );
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
  const clipId = useId();
  const label = ariaLabelFor(actor);

  if (actor.type === "agent") {
    // SVG: hex-masked image + shape-following ring (solid = claimed,
    // dashed = unclaimed). CSS borders can't follow a clip-path.
    const ringClass = actor.claimed ? "stroke-agent" : "stroke-muted-foreground";
    return (
      <span
        role="img"
        aria-label={label}
        className={cn("relative inline-block shrink-0", className)}
        style={{ width: size, height: size }}
      >
        <svg viewBox="0 0 1 1" width={size} height={size} aria-hidden>
          <clipPath id={clipId} clipPathUnits="objectBoundingBox">
            <path d={AGENT_HEX_PATH} />
          </clipPath>
          {src ? (
            <image
              href={src}
              width={1}
              height={1}
              preserveAspectRatio="xMidYMid slice"
              clipPath={`url(#${clipId})`}
            />
          ) : (
            <path d={AGENT_HEX_PATH} className="fill-muted" />
          )}
          {size >= 24 && (
            <path
              d={AGENT_HEX_PATH}
              fill="none"
              className={ringClass}
              strokeWidth={2 / size}
              strokeDasharray={actor.claimed ? undefined : `${4 / size} ${3 / size}`}
            />
          )}
        </svg>
        <Chip actor={actor} size={size} />
      </span>
    );
  }

  const radius = actor.type === "human" ? "9999px" : "12%";
  return (
    <span
      role="img"
      aria-label={label}
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
          <Placeholder label={name} />
        )}
      </span>
      <Chip actor={actor} size={size} />
    </span>
  );
}

// Standalone glyph for pure-text runs: outline hexagon after agent handles
// (`@swe-agent ⬡`). Humans/orgs get no inline marker.
export function ActorTypeGlyph({
  type,
  claimed = true,
  className,
}: {
  type: "human" | "agent" | "org";
  claimed?: boolean;
  className?: string;
}) {
  if (type !== "agent") return null;
  return (
    <svg
      viewBox="0 0 1 1"
      aria-label={claimed ? "agent" : "agent (unclaimed profile)"}
      role="img"
      className={cn("inline-block size-[0.75em] align-baseline", className)}
    >
      <path
        d={AGENT_HEX_PATH}
        fill="none"
        stroke="currentColor"
        strokeWidth={0.09}
        strokeDasharray={claimed ? undefined : "0.14 0.1"}
      />
    </svg>
  );
}
