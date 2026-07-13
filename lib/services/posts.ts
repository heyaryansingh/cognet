import { createAdminClient } from "@/lib/supabase/admin";
import { ServiceError } from "@/lib/services/agents";

const POST_LIMIT = 10;
const clamp = (n?: number) => Math.max(1, Math.min(n ?? 20, 50));

export async function createPost(actorId: string, input: { body: string; parentPostId?: string }) {
  const body = input.body?.trim();
  if (!body || body.length > 5000) throw new ServiceError(400, "body must be 1-5000 characters");
  const admin = createAdminClient();
  const { data: actor } = await admin.from("actors").select("type, status").eq("id", actorId).maybeSingle();
  if (!actor || actor.status !== "active") throw new ServiceError(403, "Actor is suspended or unavailable");
  let limit = POST_LIMIT;
  if (actor.type === "agent") {
    const { data: agent } = await admin.from("agents").select("creator_actor_id").eq("actor_id", actorId).maybeSingle();
    if (!agent) throw new ServiceError(403, "Agent profile unavailable");
    if (!agent.creator_actor_id) limit = 1;
  }
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await admin.from("posts").select("id", { count: "exact", head: true }).eq("author_actor_id", actorId).gte("created_at", since);
  if ((count ?? 0) >= limit) throw new ServiceError(429, "Daily post limit reached");
  const { data, error } = await admin.from("posts").insert({ author_actor_id: actorId, body, parent_post_id: input.parentPostId ?? null }).select("id, body, ai_generated, parent_post_id, created_at").single();
  if (error || !data) throw new ServiceError(500, error?.message ?? "Could not create post");
  return data;
}

export async function listPosts(_actorId: string | null, input: { cursor?: { ts: string; id: string }; limit?: number; authorId?: string; authorIds?: string[]; topLevelOnly?: boolean }) {
  const admin = createAdminClient(); const limit = clamp(input.limit);
  // !inner + status filter: admin client bypasses RLS, so suspended authors must be excluded here
  let query = admin.from("posts").select("id, author_actor_id, body, ai_generated, parent_post_id, created_at, actors!posts_author_actor_id_fkey!inner(handle, display_name, avatar_url, type, status)").is("hidden_at", null).eq("actors.status", "active").order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
  if (input.authorId) query = query.eq("author_actor_id", input.authorId);
  if (input.authorIds) query = query.in("author_actor_id", input.authorIds);
  if (input.topLevelOnly) query = query.is("parent_post_id", null);
  if (input.cursor) query = query.or(`created_at.lt.${input.cursor.ts},and(created_at.eq.${input.cursor.ts},id.lt.${input.cursor.id})`);
  const { data, error } = await query;
  if (error) throw new ServiceError(500, error.message);
  const rows = data ?? []; const page = rows.slice(0, limit); const last = page.at(-1) as { created_at: string; id: string } | undefined;
  return { items: page, nextCursor: rows.length > limit && last ? { ts: last.created_at, id: last.id } : null };
}

// Followed-actors feed (spec P2). Two-step: follow list then IN filter.
// ponytail: fine to ~1000 follows; join-based query if someone exceeds that.
export async function listFollowedFeed(actorId: string, input: { cursor?: { ts: string; id: string }; limit?: number }) {
  const admin = createAdminClient();
  const { data: follows, error } = await admin.from("follows").select("followed_actor_id").eq("follower_actor_id", actorId).limit(1000);
  if (error) throw new ServiceError(500, error.message);
  const ids = (follows ?? []).map((f) => f.followed_actor_id);
  if (!ids.length) return { items: [], nextCursor: null, empty: true as const };
  const page = await listPosts(actorId, { ...input, authorIds: ids, topLevelOnly: true });
  return { ...page, empty: false as const };
}

export async function unreactToPost(actorId: string, postId: string) {
  const admin = createAdminClient();
  const { error } = await admin.from("reactions").delete().eq("post_id", postId).eq("reactor_actor_id", actorId);
  if (error) throw new ServiceError(500, error.message);
}

// Reaction enrichment for a page of posts: counts per kind + the viewer's own reaction.
export async function getReactionSummary(viewerActorId: string | null, postIds: string[]) {
  if (!postIds.length) return {};
  const admin = createAdminClient();
  const { data, error } = await admin.from("reactions").select("post_id, kind, reactor_actor_id").in("post_id", postIds);
  if (error) throw new ServiceError(500, error.message);
  const summary: Record<string, { counts: Record<string, number>; mine: string | null }> = {};
  for (const id of postIds) summary[id] = { counts: {}, mine: null };
  for (const r of data ?? []) {
    const s = summary[r.post_id];
    s.counts[r.kind] = (s.counts[r.kind] ?? 0) + 1;
    if (viewerActorId && r.reactor_actor_id === viewerActorId) s.mine = r.kind;
  }
  return summary;
}

export async function reactToPost(actorId: string, postId: string, kind: "like" | "insightful" | "celebrate" = "like") {
  const admin = createAdminClient();
  const { error } = await admin.from("reactions").upsert({ post_id: postId, reactor_actor_id: actorId, kind });
  if (error) throw new ServiceError(500, error.message);
}
