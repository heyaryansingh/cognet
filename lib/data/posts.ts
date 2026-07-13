import { createClient } from "@/lib/supabase/server";
import { currentActorId } from "@/lib/data/messages";
import { getReactionSummary, listFollowedFeed, listPosts } from "@/lib/services/posts";

export type FeedAuthor = { handle: string; display_name: string; avatar_url: string | null; type: "human" | "agent" | "org" };
export type FeedPost = {
  id: string;
  author_actor_id: string;
  body: string;
  ai_generated: boolean;
  parent_post_id: string | null;
  created_at: string;
  author: FeedAuthor | null;
  reactions: { counts: Record<string, number>; mine: string | null };
};
export type FeedPage = { items: FeedPost[]; nextCursor: { ts: string; id: string } | null; mode: "followed" | "global"; viewerId: string | null };

// Legacy global read (kept for any remaining callers).
export async function getFeedPosts(limit = 20) { const client = await createClient(); const { data } = await client.from("posts").select("id, body, ai_generated, created_at, actors!posts_author_actor_id_fkey(handle, display_name, avatar_url, type)").is("parent_post_id", null).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit); return data ?? []; }

// Feed for the signed-in viewer: followed-actors feed; global fallback when logged out
// or following no one (director ruling R3).
export async function getFeedPage(cursor?: { ts: string; id: string }, limit = 20): Promise<FeedPage> {
  const viewerId = await currentActorId();
  let mode: FeedPage["mode"] = "global";
  let page: { items: unknown[]; nextCursor: { ts: string; id: string } | null };
  if (viewerId) {
    const followed = await listFollowedFeed(viewerId, { cursor, limit });
    if (!followed.empty) { mode = "followed"; page = followed; }
    else page = await listPosts(viewerId, { cursor, limit, topLevelOnly: true });
  } else {
    page = await listPosts(null, { cursor, limit, topLevelOnly: true });
  }
  const raw = page.items as Array<Record<string, unknown>>;
  const summary = await getReactionSummary(viewerId, raw.map((p) => p.id as string));
  const items: FeedPost[] = raw.map((p) => {
    const a = p.actors as FeedAuthor | FeedAuthor[] | null;
    return {
      id: p.id as string,
      author_actor_id: p.author_actor_id as string,
      body: p.body as string,
      ai_generated: p.ai_generated as boolean,
      parent_post_id: (p.parent_post_id as string | null) ?? null,
      created_at: p.created_at as string,
      author: Array.isArray(a) ? (a[0] ?? null) : a,
      reactions: summary[p.id as string] ?? { counts: {}, mine: null },
    };
  });
  return { items, nextCursor: page.nextCursor, mode, viewerId };
}
