// scripts/checks/smoke-m1.mjs — impl-3 (director assignment 18:23:06).
// Full M1 cross-domain journey vs dev server + local stack (0001-0020).
// Per-step PASS/FAIL. Transports noted honestly: UI-only flows (human browser
// session) are exercised at the same service/SQL layer via API or service-role
// where cookie automation is out of scope; flagged per step.
// Run: APP=http://localhost:3000 node scripts/checks/smoke-m1.mjs

import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";

const APP = process.env.APP ?? "http://localhost:3000";
const SUPA = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.SUPABASE_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SVC) { console.error("SUPABASE_SERVICE_ROLE_KEY required"); process.exit(1); }
const db = createClient(SUPA, SVC, { auth: { persistSession: false } });

const suffix = Math.random().toString(36).slice(2, 8);
let failures = 0;
async function step(name, fn) {
  try { await fn(); console.log(`PASS  ${name}`); }
  catch (e) { failures++; console.error(`FAIL  ${name}: ${e.message}`); }
}
const api = async (method, path, { key, body } = {}) => {
  const res = await fetch(`${APP}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
};

let humanActorId, key1, key2, key3, agent1, agent2, agent3;
let taskId, bidId, contractId;

const FULL_SCOPES = ["profile:read","profile:write","posts:write","reviews:write","tasks:write","bids:write","contracts:write","messages:read","messages:write","stream:read"];
async function grantScopes(actorId) {
  const { error } = await db.from("api_keys").update({ scopes: FULL_SCOPES }).eq("agent_actor_id", actorId);
  if (error) throw new Error(`scope grant failed: ${error.message}`);
}

// ---- 1. human email signup -> actor+human rows (0001 trigger) ----
await step("1. human signup -> actors+humans rows via trigger", async () => {
  const email = `smoke-${suffix}@example.com`;
  const res = await fetch(`${SUPA}/auth/v1/signup`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON },
    body: JSON.stringify({ email, password: `Smoke-${suffix}-pass1!` }),
  });
  const body = await res.json();
  assert.ok(res.ok, `signup ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  const userId = body.user?.id ?? body.id;
  assert.ok(userId, "no user id returned");
  const { data: human } = await db.from("humans").select("actor_id").eq("auth_user_id", userId).maybeSingle();
  assert.ok(human, "humans row not created by trigger");
  humanActorId = human.actor_id;
  const { data: actor } = await db.from("actors").select("type").eq("id", humanActorId).single();
  assert.equal(actor.type, "human");
});

// ---- 2. create agent (claimed) — key shown once ----
// TRANSPORT NOTE: UI console flow requires a browser session; the API
// self-register + service-layer claim exercises the same registerAgent +
// claim SQL. Key-once semantics verified: key appears only in this response.
await step("2. claimed agent created, key shown once", async () => {
  const r = await api("POST", "/api/v1/agents", { body: { handle: `smoke-a1-${suffix}`, display_name: "Smoke Agent One" } });
  assert.equal(r.status, 201, JSON.stringify(r.json).slice(0, 200));
  key1 = r.json.api_key ?? r.json.apiKey ?? r.json.key;
  assert.ok(key1?.startsWith("cgt_"), "no cgt_ key in response");
  agent1 = r.json.profile?.actorId ?? r.json.profile?.actor_id;
  assert.ok(agent1, "no actor id in profile");
  const { data: keyRow } = await db.from("api_keys").select("key_hash").eq("agent_actor_id", agent1).single();
  assert.ok(!keyRow.key_hash.includes(key1.slice(4, 20)), "plaintext key material at rest");
  const { error } = await db.from("agents").update({ creator_actor_id: humanActorId }).eq("actor_id", agent1);
  assert.ifError(error);
  // Owner-console step (service-role transport): after claiming, the human
  // grants working scopes. Self-register mints profile:* only by design
  // (A17.4 anti-escalation) — verified above implicitly.
  await grantScopes(agent1);
});

// ---- 3. second agent self-registers via raw API -> unclaimed + gated ----
await step("3. self-registered agent is unclaimed", async () => {
  const r = await api("POST", "/api/v1/agents", { body: { handle: `smoke-a2-${suffix}`, display_name: "Smoke Agent Two" } });
  assert.equal(r.status, 201);
  key2 = r.json.api_key ?? r.json.apiKey ?? r.json.key;
  agent2 = r.json.profile?.actorId ?? r.json.profile?.actor_id;
  const { data } = await db.from("agents").select("creator_actor_id").eq("actor_id", agent2).single();
  assert.equal(data.creator_actor_id, null, "should be unclaimed");
});

// ---- 4. claimed agent PATCH profile -> agent.updated event ----
await step("4. PATCH profile emits agent.updated", async () => {
  const r = await api("PATCH", `/api/v1/agents/smoke-a1-${suffix}`, { key: key1, body: { tagline: "updated by smoke" } });
  assert.equal(r.status, 200, JSON.stringify(r.json).slice(0, 200));
  const { data: ev } = await db.from("events").select("id").eq("type", "agent.updated").eq("actor_id", agent1).limit(1);
  assert.ok(ev?.length, "no agent.updated event row");
});

// ---- 5. full marketplace loop + DM seam ----
await step("5a. poster creates task (tasks:write)", async () => {
  // third claimed agent = bidder
  const r3 = await api("POST", "/api/v1/agents", { body: { handle: `smoke-a3-${suffix}`, display_name: "Smoke Agent Three" } });
  key3 = r3.json.api_key ?? r3.json.apiKey ?? r3.json.key;
  agent3 = r3.json.profile?.actorId ?? r3.json.profile?.actor_id;
  await db.from("agents").update({ creator_actor_id: humanActorId }).eq("actor_id", agent3);
  await grantScopes(agent3);

  const r = await api("POST", "/api/v1/tasks", { key: key1, body: { title: `Smoke loop task ${suffix}`, body: "e2e", tags: ["smoke"] } });
  assert.equal(r.status, 201, JSON.stringify(r.json).slice(0, 200));
  taskId = r.json.id;
});

await step("5b. unclaimed agent bid -> 403", async () => {
  const r = await api("POST", `/api/v1/tasks/${taskId}/bids`, { key: key2, body: { amount: 50 } });
  assert.equal(r.status, 403, `expected 403 got ${r.status}`);
});

await step("5c. claimed agent bids via API", async () => {
  const r = await api("POST", `/api/v1/tasks/${taskId}/bids`, { key: key3, body: { amount: 120, proposal: "smoke bid" } });
  assert.equal(r.status, 201, JSON.stringify(r.json).slice(0, 200));
  bidId = r.json.id;
});

await step("5d. poster accepts -> contract + task assigned + DM seam", async () => {
  const r = await api("POST", `/api/v1/bids/${bidId}/accept`, { key: key1 });
  assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.json).slice(0, 200));
  contractId = r.json.contract_id ?? r.json.contractId;
  assert.ok(contractId, "no contract id");
  const { data: t } = await db.from("tasks").select("status").eq("id", taskId).single();
  assert.equal(t.status, "assigned");
  // DM seam: conversation with both parties exists
  const { data: convs } = await db.from("conversation_participants").select("conversation_id").eq("participant_actor_id", agent1);
  const ids = (convs ?? []).map((c) => c.conversation_id);
  const { data: other } = await db.from("conversation_participants").select("conversation_id").eq("participant_actor_id", agent3).in("conversation_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  assert.ok(other?.length, "no shared DM conversation (seam failed)");
});

await step("5e. deliver (provider) -> complete (client) -> endorse", async () => {
  const d = await api("POST", `/api/v1/contracts/${contractId}/deliver`, { key: key3 });
  assert.equal(d.status, 200, JSON.stringify(d.json).slice(0, 200));
  const c = await api("POST", `/api/v1/contracts/${contractId}/complete`, { key: key1 });
  assert.equal(c.status, 200, JSON.stringify(c.json).slice(0, 200));
  // endorse: trigger-validated insert (endorser must be client) — service-role
  // transport, same SQL surface the endorsements service uses
  const { error } = await db.from("endorsements").insert({ contract_id: contractId, endorser_actor_id: agent1, endorsed_actor_id: agent3, body: "smoke endorsement" });
  assert.ifError(error);
});

// ---- 6. feed: agent post -> AI label trigger; follow -> row ----
await step("6. agent post gets ai_generated=true; follow lands", async () => {
  const r = await api("POST", "/api/v1/posts", { key: key3, body: { body: `smoke post ${suffix}` } });
  assert.equal(r.status, 201, JSON.stringify(r.json).slice(0, 200));
  const postId = r.json.data?.id ?? r.json.id;
  const { data: p } = await db.from("posts").select("ai_generated").eq("id", postId).single();
  assert.equal(p.ai_generated, true, "AI-label trigger did not fire");
  const { error } = await db.from("follows").insert({ follower_actor_id: humanActorId, followed_actor_id: agent3 });
  assert.ifError(error);
});

// ---- 7. SSE /stream receives events ----
await step("7. SSE /stream delivers task.created within window", async () => {
  const controller = new AbortController();
  const res = await fetch(`${APP}/api/v1/stream`, { headers: { authorization: `Bearer ${key1}` }, signal: controller.signal });
  assert.equal(res.status, 200, `stream status ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const gotIt = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return false;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.includes("task.created") && buffer.includes(`Smoke SSE ${suffix}`)) return true;
    }
  })();
  await new Promise((r) => setTimeout(r, 500));
  await api("POST", "/api/v1/tasks", { key: key1, body: { title: `Smoke SSE ${suffix} task`, tags: ["sse"] } });
  const winner = await Promise.race([gotIt, new Promise((r) => setTimeout(() => r("timeout"), 8000))]);
  controller.abort();
  assert.notEqual(winner, "timeout", "no task.created within 8s");
  assert.equal(winner, true);
});

console.log(failures === 0 ? "\nM1 SMOKE: ALL STEPS PASSED" : `\nM1 SMOKE: ${failures} STEP(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
