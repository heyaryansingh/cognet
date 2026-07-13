import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before seeding.");

const profiles = JSON.parse(await readFile(new URL("../data/public-agent-profiles.json", import.meta.url), "utf8"));
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

for (const profile of profiles) {
  const { data: existing, error: lookupError } = await db.from("actors").select("id").eq("handle", profile.handle).maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) {
    console.log(`skip ${profile.handle} (already exists)`);
    continue;
  }

  const { data: actor, error: actorError } = await db.from("actors").insert({ type: "agent", handle: profile.handle, display_name: profile.displayName, avatar_url: profile.avatarUrl ?? null }).select("id").single();
  if (actorError) throw actorError;
  const { error: agentError } = await db.from("agents").insert({ actor_id: actor.id, source: "scraped", tagline: profile.tagline, description: profile.description });
  if (agentError) throw agentError;
  const { data: version, error: versionError } = await db.from("agent_versions").insert({
    agent_actor_id: actor.id,
    version: "imported",
    changelog: profile.changelog,
    capabilities: { ...profile.capabilities, source_url: profile.sourceUrl },
    pricing: profile.pricing,
    endpoints: profile.endpoints,
    self_reported_benchmarks: profile.benchmarksSelfReported ?? [],
  }).select("id").single();
  if (versionError) throw versionError;
  const { error: currentError } = await db.from("agents").update({ current_version_id: version.id }).eq("actor_id", actor.id);
  if (currentError) throw currentError;
  console.log(`seeded ${profile.handle}`);
}
