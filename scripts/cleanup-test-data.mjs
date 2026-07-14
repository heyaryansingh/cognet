// Removes throwaway fixtures created by smoke/e2e runs (local/dev DB hygiene).
// Matches explicit test-handle patterns only; never touches seeded or real actors.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

const TEST_PATTERNS = [
  "e2e%", "smoke-%", "bh-%", "bw-agent-%", "chkm%", "client-%", "dz-%",
  "ghost-%", "hire-tgt-%", "hirer-%", "msgr-%", "provider-%", "rival-%",
];

const ids = new Set();
for (const pattern of TEST_PATTERNS) {
  const { data, error } = await db.from("actors").select("id, handle").like("handle", pattern);
  if (error) throw error;
  for (const row of data ?? []) { ids.add(row.id); console.log(`match ${row.handle}`); }
}
const list = [...ids];
if (!list.length) { console.log("nothing to clean"); process.exit(0); }
console.log(`\ndeleting ${list.length} test actors + dependents…`);

async function del(table, filter) {
  const { error, count } = await filter(db.from(table).delete({ count: "exact" }));
  if (error) throw new Error(`${table}: ${error.message}`);
  if (count) console.log(`  ${table}: ${count}`);
}

const inList = (col) => (q) => q.in(col, list);
const orIn = (a, b) => (q) => q.or(`${a}.in.(${list.join(",")}),${b}.in.(${list.join(",")})`);

// FK order: leaf money/marketplace rows first (no cascade), then actors (rest cascades)
const { data: contractRows } = await db.from("contracts").select("id")
  .or(`client_actor_id.in.(${list.join(",")}),provider_actor_id.in.(${list.join(",")})`);
const contractIds = (contractRows ?? []).map((c) => c.id);
if (contractIds.length) {
  await del("contract_events", (q) => q.in("contract_id", contractIds));
  await del("endorsements", (q) => q.in("contract_id", contractIds));
  const { error: reviewErr } = await db.from("reviews").update({ contract_id: null }).in("contract_id", contractIds);
  if (reviewErr) throw new Error(`reviews: ${reviewErr.message}`);
  const { error: taskErr } = await db.from("tasks").update({ parent_contract_id: null }).in("parent_contract_id", contractIds);
  if (taskErr) throw new Error(`tasks unlink: ${taskErr.message}`);
  await del("escrows", (q) => q.in("contract_id", contractIds));
  await del("contracts", (q) => q.in("id", contractIds));
}
// messaging: conversations created by or involving test actors
const { data: convA } = await db.from("conversations").select("id").in("created_by", list);
const { data: convB } = await db.from("conversation_participants").select("conversation_id").in("participant_actor_id", list);
const convIds = [...new Set([...(convA ?? []).map((c) => c.id), ...(convB ?? []).map((c) => c.conversation_id)])];
if (convIds.length) {
  await del("messages", (q) => q.in("conversation_id", convIds));
  await del("conversation_participants", (q) => q.in("conversation_id", convIds));
  await del("conversations", (q) => q.in("id", convIds));
}
await del("messages", inList("sender_actor_id"));
const { data: evRows } = await db.from("events").select("id").or(`actor_id.in.(${list.join(",")}),recipient_actor_id.in.(${list.join(",")})`);
const evIds = (evRows ?? []).map((e) => e.id);
if (evIds.length) {
  await del("onboarding_progress", (q) => q.in("evidence_event_id", evIds));
  await del("outbound_webhook_deliveries", (q) => q.in("event_id", evIds));
  await del("events", (q) => q.in("id", evIds));
}
await del("contract_events", inList("actor_id"));
await del("claim_tokens", inList("claimed_by_actor_id"));
await del("promotions", inList("actor_id"));
await del("bids", inList("bidder_actor_id"));
await del("tasks", inList("poster_actor_id"));
await del("eval_artifacts", inList("agent_actor_id"));
await del("notifications", inList("actor_id"));
await del("endorsements", (q) => q.or(`endorser_actor_id.in.(${list.join(",")}),endorsed_actor_id.in.(${list.join(",")})`));
// agents created/claimed by test humans: unlink so the human actor can go
const { error: unclaimErr } = await db.from("agents").update({ creator_actor_id: null }).in("creator_actor_id", list);
if (unclaimErr) throw new Error(`agents unlink: ${unclaimErr.message}`);
await del("actors", inList("id"));

// auth.users left behind (actor deleted, login shell remains) break re-runs:
// sign-in succeeds but no actor row exists. Remove orphaned auth users too.
let page = 1, removedUsers = 0;
for (;;) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  for (const user of data.users) {
    const { data: human } = await db.from("humans").select("actor_id").eq("auth_user_id", user.id).maybeSingle();
    if (!human) {
      await db.auth.admin.deleteUser(user.id);
      removedUsers++;
      console.log(`  auth user removed: ${user.email}`);
    }
  }
  if (data.users.length < 200) break;
  page++;
}
console.log(`orphaned auth users removed: ${removedUsers}`);
console.log("done");
