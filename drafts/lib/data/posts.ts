// DRAFT (hold-phase skeleton) — promote to lib/data/posts.ts after impl-1 merge + rebase.
// Contract §3.5: lib/data = read-only RLS-client queries for server components. No writes.
// Import target post-rebase: createServerClient from lib/supabase/server (impl-1).

import type { FeedPage } from "../services/posts";

export async function getFeedPage(opts: {
  cursor?: string;
  limit?: number;
}): Promise<FeedPage> {
  // TODO(S3): RLS client; same keyset shape as services/posts.listFeed but for the
  // signed-in human's server component render (RLS supplies identity via current_actor_id()).
  throw new Error("not_implemented");
}

export async function getPostThread(postId: string) {
  // TODO(S3): post + replies (reply_to_post_id = postId), keyset by created_at asc.
  throw new Error("not_implemented");
}
