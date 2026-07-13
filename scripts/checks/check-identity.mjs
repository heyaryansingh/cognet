// check-identity.mjs — impl-1 domain runnable check (contract A14).
// Assert-based, runs against the LOCAL supabase stack (supabase start),
// exits non-zero on any failure. Covers: key format, signup trigger +
// handle collision, column-limited grants, api_keys/scope_grants/humans
// lockdown, public reads, Flight Plan evidence invariant + grant PKs.
//
// Usage: node scripts/checks/check-identity.mjs
// Env (defaults = supabase local dev keys):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { strict as assert } from "node:assert";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const admin = createClient(URL_, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const run = `chk${Date.now().toString(36)}`;
let failures = 0;
const cleanupUserIds = [];
const cleanupActorIds = [];

async function check(name, fn) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failures++;
    console.error(`FAIL ${name}: ${e.message}`);
  }
}

// ------------------------------------------------------------ key format

await check("key format + sha256 hash shape", async () => {
  const base62 =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const part = (n) => [...randomBytes(n)].map((b) => base62[b % 62]).join("");
  const key = `cgt_${part(8)}${part(32)}`;
  assert.match(key, /^cgt_[A-Za-z0-9]{40}$/);
  assert.equal(createHash("sha256").update(key).digest("hex").length, 64);
});

// ---------------------------------------------------------------- signup

await check("signup trigger creates actor + human", async () => {
  const { data, error } = await admin.auth.admin.createUser({
    email: `${run}-alice@example.com`,
    password: "check-password-1!",
    email_confirm: true,
    user_metadata: { display_name: "Check Alice" },
  });
  assert.equal(error, null, error?.message);
  cleanupUserIds.push(data.user.id);
  const { data: human } = await admin
    .from("humans")
    .select("actor_id")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();
  assert.ok(human?.actor_id, "humans row missing");
  const { data: actor } = await admin
    .from("actors")
    .select("type, handle")
    .eq("id", human.actor_id)
    .single();
  assert.equal(actor.type, "human");
  assert.ok(actor.handle.startsWith(`${run}-alice`), `handle=${actor.handle}`);
});

await check("handle collision gets numeric suffix", async () => {
  const { data, error } = await admin.auth.admin.createUser({
    email: `${run}-alice@other.com`,
    password: "check-password-1!",
    email_confirm: true,
  });
  assert.equal(error, null, error?.message);
  cleanupUserIds.push(data.user.id);
  const { data: human } = await admin
    .from("humans")
    .select("actor_id")
    .eq("auth_user_id", data.user.id)
    .single();
  const { data: actor } = await admin
    .from("actors")
    .select("handle")
    .eq("id", human.actor_id)
    .single();
  assert.equal(actor.handle, `${run}-alice-1`);
});

// ------------------------------------------------- column-limited grants

await check("authenticated edits display_name; type/handle blocked", async () => {
  const authed = createClient(URL_, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErr } = await authed.auth.signInWithPassword({
    email: `${run}-alice@example.com`,
    password: "check-password-1!",
  });
  assert.equal(signInErr, null, signInErr?.message);

  const { data: me } = await authed.rpc("current_actor_id");
  assert.ok(me, "current_actor_id() returned null");

  const { error: okErr } = await authed
    .from("actors")
    .update({ display_name: "Check Alice Renamed" })
    .eq("id", me);
  assert.equal(okErr, null, okErr?.message);

  const { error: typeErr } = await authed
    .from("actors")
    .update({ type: "org" })
    .eq("id", me);
  assert.ok(typeErr, "type escalation was NOT blocked");

  const { error: handleErr } = await authed
    .from("actors")
    .update({ handle: "admin" })
    .eq("id", me);
  assert.ok(handleErr, "handle rewrite was NOT blocked");
  await authed.auth.signOut();
});

// ------------------------------------------------------------- lockdowns

const anon = createClient(URL_, ANON, {
  auth: { autoRefreshToken: false, persistSession: false },
});

await check("anon blocked from api_keys", async () => {
  const { error } = await anon.from("api_keys").select("id").limit(1);
  assert.ok(error, "anon could select api_keys");
});

await check("anon blocked from scope_grants", async () => {
  const { error } = await anon.from("scope_grants").select("scope").limit(1);
  assert.ok(error, "anon could select scope_grants");
});

await check("anon blocked from humans", async () => {
  const { error } = await anon.from("humans").select("actor_id").limit(1);
  assert.ok(error, "anon could select humans");
});

await check("anon can read actors/agents/onboarding_steps", async () => {
  for (const table of ["actors", "agents", "onboarding_steps"]) {
    const { error } = await anon.from(table).select("*").limit(1);
    assert.equal(error, null, `${table}: ${error?.message}`);
  }
});

// ----------------------------------------------------------- flight plan

await check("flight plan evidence invariant + grant PK", async () => {
  const { data: actor, error: aErr } = await admin
    .from("actors")
    .insert({ type: "agent", handle: `${run}-agent`, display_name: "Check Agent" })
    .select("id")
    .single();
  assert.equal(aErr, null, aErr?.message);
  cleanupActorIds.push(actor.id);
  await admin.from("agents").insert({ actor_id: actor.id });

  // progress without a real event must fail (FK)
  const { error: orphanErr } = await admin.from("onboarding_progress").insert({
    agent_actor_id: actor.id,
    step_id: "first-post",
    evidence_event_id: 99999999,
  });
  assert.ok(orphanErr, "orphan evidence_event_id accepted");

  // real event -> progress + grant succeeds; duplicate grant blocked by PK
  await admin.rpc("emit_event", {
    p_type: "post.created",
    p_actor_id: actor.id,
    p_payload: {},
    p_recipient_actor_id: null,
  });
  const { data: ev } = await admin
    .from("events")
    .select("id")
    .eq("actor_id", actor.id)
    .order("id", { ascending: false })
    .limit(1)
    .single();
  const { error: progErr } = await admin.from("onboarding_progress").insert({
    agent_actor_id: actor.id,
    step_id: "first-post",
    evidence_event_id: ev.id,
  });
  assert.equal(progErr, null, progErr?.message);
  const { error: grantErr } = await admin.from("scope_grants").insert({
    agent_actor_id: actor.id,
    scope: "bids:write",
    source_step_id: "first-post",
  });
  assert.equal(grantErr, null, grantErr?.message);
  const { error: dupErr } = await admin.from("scope_grants").insert({
    agent_actor_id: actor.id,
    scope: "bids:write",
  });
  assert.ok(dupErr, "duplicate scope grant accepted");
});

// -------------------------------------------------------------- cleanup

for (const id of cleanupUserIds) await admin.auth.admin.deleteUser(id);
for (const id of cleanupActorIds) await admin.from("actors").delete().eq("id", id);

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nall identity checks passed");
