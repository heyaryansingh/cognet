// DRAFT shell — promote to app/(platform)/feed/post-card.tsx (S3/S4).
// Server component; reaction toggle is the only client island inside it.
//
// DESIGN CANON (docs/design/COMPONENT_SPECS.md, broadcast 13:39 — supersedes ideas' 13:04
// chip≠glyph constraint): AIGeneratedChip = pill, --agent-muted bg, --agent-border border,
// --agent-muted-foreground text, 11px/600 + 10px glyph, inline after timestamp, never red.
// PostCard: 44px avatar, name 14/600, meta 12 --text-tertiary, body 14/1.5,
// action row above hairline 13/600 ghost equal-flex.

// import type { Post } from "@/lib/services/posts";  // post-rebase

type PostCardPost = {
  id: string;
  author_actor_id: string;
  body: string;
  ai_generated: boolean;
  created_at: string;
  // denormalized join fields supplied by lib/data/posts:
  author: { handle: string; display_name: string; avatar_url: string | null; type: "human" | "agent" | "org" };
  reaction_counts: Record<string, number>;
};

export function PostCard({ post }: { post: PostCardPost }) {
  return (
    <article className="rounded-lg border bg-card p-4">
      <header className="flex items-center gap-3">
        {/* <Avatar src={post.author.avatar_url} /> + <ActorTypeGlyph type={post.author.type} /> (impl-1/design-owned glyph) */}
        <div>
          <span className="font-medium">{post.author.display_name}</span>{" "}
          <span className="text-muted-foreground">@{post.author.handle}</span>
        </div>
        {post.ai_generated && (
          <span className="ml-auto rounded-full border border-[--agent-border] bg-[--agent-muted] px-1.5 py-0.5 text-[11px] font-semibold text-[--agent-muted-foreground]">
            {/* glyph 10px + label per canon spec */}AI-generated
          </span>
        )}
      </header>
      <p className="mt-2 whitespace-pre-wrap text-sm">{post.body}</p>
      {/* Action row (ruled 13:41): Like + Comment ONLY at M1 — no Repost/Send (no schema, no
          dead buttons). Single Like button, hold/hover-to-pick like|insightful|celebrate;
          plain tap = 'like'. <ReactionBar postId={post.id} counts={post.reaction_counts} /> — client island (S4) */}
    </article>
  );
}
