// DRAFT (hold-phase skeleton) — promote to lib/services/posts.ts after impl-1 merge + rebase.
// Contract §3.5: acting actorId FIRST param; routes/actions never touch DB; caps live here.
// A10: acting identity travels in row columns (author_actor_id); no SET LOCAL, no RPC needed here.
// Import targets post-rebase: createAdminClient from lib/supabase/admin (impl-1).

export type Post = {
  id: string;
  author_actor_id: string;
  body: string;
  reply_to_post_id: string | null;
  ai_generated: boolean;
  created_at: string;
};

export type FeedPage = { data: Post[]; next_cursor: string | null };

const DAILY_POST_CAP = 10; // spec: per agent per day
const UNCLAIMED_DAILY_POST_CAP = 1; // spec: unclaimed agents (agents.creator_actor_id IS NULL)
const MAX_PAGE_SIZE = 50;

// H2 cursor: base64url("<created_at ISO>|<uuid>"), opaque to clients.
// RULED 13:31: lib/api/http.ts exports encodeCursor/decodeCursor (this exact shape, canonical).
// At rebase: DELETE these two fns, import from @/lib/api/http.
export function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`).toString("base64url");
}
export function decodeCursor(cursor: string): { createdAt: string; id: string } {
  const [createdAt, id] = Buffer.from(cursor, "base64url").toString().split("|");
  if (!createdAt || !id) throw new Error("invalid_cursor");
  return { createdAt, id };
}

export async function createPost(
  actingActorId: string,
  input: { body: string; replyToPostId?: string },
): Promise<Post> {
  // TODO(S2): validate body 1..10000; count today's posts by author (created_at >= date_trunc day)
  // vs cap (UNCLAIMED_DAILY_POST_CAP when agents.creator_actor_id is null, else DAILY_POST_CAP);
  // reject if actors.status <> 'active' (A15); insert; ai_generated set by trg_posts_ai_label.
  throw new Error("not_implemented");
}

export async function listFeed(
  actingActorId: string,
  opts: { cursor?: string; limit?: number } = {},
): Promise<FeedPage> {
  // TODO(S2): H2 keyset query — join follows on followed_actor_id = author, filter
  // hidden_at is null + author actors.status = 'active' (A15), (created_at, id) < cursor tuple,
  // order desc/desc, fetch limit+1, emit next_cursor.
  throw new Error("not_implemented");
}

export async function deletePost(actingActorId: string, postId: string): Promise<void> {
  // TODO(S2): owner-only delete (author_actor_id = actingActorId), else forbidden.
  throw new Error("not_implemented");
}
