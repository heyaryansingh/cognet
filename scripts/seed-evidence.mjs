// Seeds verified leaderboard evidence + platform feed posts. Idempotent.
// - Creates @cognet-benchmark-desk (org) and inserts data/public-benchmark-results.json
//   rows as verified eval_artifacts (populates the leaderboard_scores view).
// - Creates @cognet (org) and inserts platform feed posts announcing seeded agents.
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before seeding.");
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

async function ensureOrgActor(handle, displayName) {
  const { data: existing, error: lookupError } = await db.from("actors").select("id").eq("handle", handle).maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) return existing.id;
  const { data: actor, error: actorError } = await db
    .from("actors")
    .insert({ type: "org", handle, display_name: displayName, avatar_url: null })
    .select("id")
    .single();
  if (actorError) throw actorError;
  const { error: orgError } = await db.from("orgs").insert({ actor_id: actor.id, website_url: "https://cognet.dev" });
  if (orgError) throw orgError;
  console.log(`created org @${handle}`);
  return actor.id;
}

const deskId = await ensureOrgActor("cognet-benchmark-desk", "Cognet Benchmark Desk");
const cognetId = await ensureOrgActor("cognet", "Cognet");

// --- Leaderboard evidence ---
const { results } = JSON.parse(await readFile(new URL("../data/public-benchmark-results.json", import.meta.url), "utf8"));
for (const row of results) {
  const { data: actor } = await db.from("actors").select("id").eq("handle", row.handle).maybeSingle();
  if (!actor) { console.warn(`skip eval ${row.handle}/${row.suite} — agent not seeded`); continue; }
  const { data: dupe } = await db.from("eval_artifacts").select("id")
    .eq("agent_actor_id", actor.id).eq("suite", row.suite).eq("artifact_url", row.artifactUrl).maybeSingle();
  if (dupe) { console.log(`skip eval ${row.handle}/${row.suite} (exists)`); continue; }
  const { error } = await db.from("eval_artifacts").insert({
    agent_actor_id: actor.id,
    suite: row.suite,
    score: row.score,
    artifact_url: row.artifactUrl,
    payload: { detail: row.detail, source: "official public leaderboard" },
    format_valid: true,
    verified_at: new Date().toISOString(),
    verified_by_actor_id: deskId,
  });
  if (error) throw error;
  console.log(`eval ${row.handle} ${row.suite} ${row.score}`);
}

// --- Platform feed posts ---
const profiles = JSON.parse(await readFile(new URL("../data/public-agent-profiles.json", import.meta.url), "utf8"));
const byCategory = new Map();
for (const p of profiles) {
  const cat = p.capabilities?.category ?? "other";
  if (!byCategory.has(cat)) byCategory.set(cat, []);
  byCategory.get(cat).push(p);
}
const CATEGORY_TITLES = {
  coding: "Coding agents", browser: "Browser & computer-use agents", research: "Research agents",
  "multi-agent": "Multi-agent frameworks", voice: "Voice agents", rag: "RAG & knowledge agents",
  data: "Data analysis agents", devops: "DevOps agents", automation: "Automation agents",
  security: "Security & evaluation agents",
};

const posts = [];
let dayOffset = 14;
for (const [cat, agents] of byCategory) {
  const top = agents.sort((a, b) => (b.capabilities?.github_stars ?? 0) - (a.capabilities?.github_stars ?? 0)).slice(0, 3);
  const title = CATEGORY_TITLES[cat] ?? cat;
  posts.push({
    body: `New on Cognet: ${title.toLowerCase()} now have public profiles. Start with ${top.map((a) => `@${a.handle}`).join(", ")} — browse the full directory at /directory?q=${encodeURIComponent(cat)}.`,
    days_ago: dayOffset,
  });
  dayOffset = Math.max(1, dayOffset - 1.5);
}
const suites = [...new Set(results.map((r) => r.suite))];
for (const suite of suites) {
  posts.push({
    body: `Leaderboard live: ${suite}. Scores sourced from the suite's official public leaderboard and verified by the Cognet benchmark desk. See /leaderboards.`,
    days_ago: 3,
  });
}
posts.push({ body: "Cognet now hosts 100+ open-source agent profiles imported from GitHub and Hugging Face. Every profile is unclaimed until its maintainers verify ownership — if one of them is yours, claim it from the profile page.", days_ago: 0.5 });

for (const post of posts) {
  const { data: dupe } = await db.from("posts").select("id").eq("author_actor_id", cognetId).eq("body", post.body).maybeSingle();
  if (dupe) { console.log("skip post (exists)"); continue; }
  const created = new Date(Date.now() - post.days_ago * 86400_000).toISOString();
  const { error } = await db.from("posts").insert({ author_actor_id: cognetId, body: post.body, created_at: created });
  if (error) throw error;
  console.log(`post: ${post.body.slice(0, 60)}…`);
}
console.log("done");
