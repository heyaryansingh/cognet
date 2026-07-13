#!/usr/bin/env node
// check-messaging (impl-4, CONTRACT A14). Two layers:
//   1. STATIC — grep migration + services for required structure (always runs, no DB).
//   2. BEHAVIORAL — live service-role assertions against a local stack: the DM-leak gate,
//      message.created fan-out, notification trigger, get_or_create_dm idempotency.
//      Runs only when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set; otherwise skips.
// Non-zero exit on any failure.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let failed = 0;
const check = async (name, fn) => {
  try { await fn(); console.log(`  ok  - ${name}`); }
  catch (e) { failed++; console.error(`  FAIL- ${name}: ${e.message}`); }
};

// ---------------------------------------------------------------- 1. STATIC
const sql = readFileSync("supabase/migrations/20260713000004_messaging_events.sql", "utf8");
const messages = readFileSync("lib/services/messages.ts", "utf8");
const events = readFileSync("lib/services/events.ts", "utf8");
await check("static: schema, RLS, triggers, dm rpc present", () => {
  for (const needle of ["create table conversations", "create table conversation_participants", "create table messages", "create table notifications", "messages_select_participant", "notifications_select_recipient", "trg_messages_emit_event", "trg_notifications_emit_event", "get_or_create_dm", "security definer"]) assert.match(sql, new RegExp(needle, "i"));
});
await check("static: sender-spoof block in messages INSERT policy", () =>
  assert.match(sql, /messages_insert_participant[\s\S]*sender_actor_id = current_actor_id\(\)[\s\S]*is_conversation_participant/));
await check("static: unclaimed-agent gate + leak filter in services", () => {
  assert.match(messages, /Unclaimed agents cannot send messages/);
  assert.match(events, /recipient_actor_id\.eq\.\$\{actorId\}.*recipient_actor_id\.is\.null/s);
});
// Regression guard (audit CRITICAL webhooks.ts:45, A17.3): the webhook fan-out is a THIRD
// outbox consumer and MUST carry the same recipient filter. A merge that resolves webhooks.ts
// to the pre-fix side would silently re-open the cross-actor DM leak — fail loudly here instead.
await check("static: webhook fan-out enforces recipient filter (A17.3)", () => {
  const webhooks = readFileSync("lib/services/webhooks.ts", "utf8");
  assert.match(webhooks, /from\("events"\)[\s\S]*recipient_actor_id\.eq\.\$\{subscription\.actor_id\}[\s\S]*recipient_actor_id\.is\.null/,
    "enqueueWebhooks events query must filter recipient_actor_id = subscriber OR NULL");
});

// ------------------------------------------------------------ 2. BEHAVIORAL
const URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.log("  skip- behavioral: set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (e.g. `supabase start`) to run the 10+6 matrix");
} else {
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(URL, KEY, { auth: { persistSession: false } });
  const tag = `chkmsg-${Date.now()}`;  // handle regex A15.2: lowercase alnum + hyphen, no underscore/trailing hyphen
  const mk = async (type, suffix, extra = {}) => {
    const { data, error } = await db.from("actors").insert({ type, handle: `${tag}-${suffix}`.slice(0, 40), display_name: `t-${suffix}` }).select("id").single();
    if (error) throw new Error(`seed ${suffix}: ${error.message}`);
    if (type === "agent") await db.from("agents").insert({ actor_id: data.id, ...extra });
    return data.id;
  };
  let A, B, C, D, conv;
  const cleanup = async () => {
    if (conv) await db.from("conversations").delete().eq("id", conv);         // cascades participants+messages
    for (const id of [A, B, C, D].filter(Boolean)) {
      await db.from("events").delete().or(`actor_id.eq.${id},recipient_actor_id.eq.${id}`);
      await db.from("notifications").delete().eq("recipient_actor_id", id);
      await db.from("agents").delete().eq("actor_id", id);
      await db.from("actors").delete().eq("id", id);
    }
  };
  try {
    A = await mk("human", "a"); B = await mk("human", "b");
    C = await mk("agent", "c", { creator_actor_id: null }); D = await mk("human", "d");

    await check("dm rpc idempotent (same thread on repeat)", async () => {
      const r1 = await db.rpc("get_or_create_dm", { p_acting_actor_id: A, p_other_actor_id: B });
      const r2 = await db.rpc("get_or_create_dm", { p_acting_actor_id: A, p_other_actor_id: B });
      if (r1.error) throw new Error(r1.error.message);
      assert.equal(r1.data, r2.data); conv = r1.data;
    });
    await check("dm rpc rejects self-message", async () => {
      const { error } = await db.rpc("get_or_create_dm", { p_acting_actor_id: A, p_other_actor_id: A });
      assert.ok(error, "expected self-message rejection");
    });

    let msgId;
    await check("message insert fires trg_messages_emit_event", async () => {
      const { data, error } = await db.from("messages").insert({ conversation_id: conv, sender_actor_id: A, body: "hi B" }).select("id").single();
      if (error) throw new Error(error.message); msgId = data.id;
    });
    await check("LEAK GATE: message.created addressed to B, NOT to A(sender)", async () => {
      const { data } = await db.from("events").select("recipient_actor_id").eq("type", "message.created").contains("payload", { message_id: msgId });
      const recips = (data ?? []).map((r) => r.recipient_actor_id);
      assert.ok(recips.includes(B), "B must be a recipient");
      assert.ok(!recips.includes(A), "sender A must NOT be a recipient");
    });
    await check("LEAK GATE: B's stream filter includes it, D's excludes it", async () => {
      const forB = await db.from("events").select("id").eq("type", "message.created").contains("payload", { message_id: msgId }).or(`recipient_actor_id.eq.${B},recipient_actor_id.is.null`);
      const forD = await db.from("events").select("id").eq("type", "message.created").contains("payload", { message_id: msgId }).or(`recipient_actor_id.eq.${D},recipient_actor_id.is.null`);
      assert.ok((forB.data ?? []).length > 0, "B must receive it");
      assert.equal((forD.data ?? []).length, 0, "D must NOT receive B's DM event");
    });
    await check("notification insert fires notification.created to recipient", async () => {
      const { data: n, error } = await db.from("notifications").insert({ recipient_actor_id: B, type: "message", actor_id: A }).select("id").single();
      if (error) throw new Error(error.message);
      const { data } = await db.from("events").select("recipient_actor_id").eq("type", "notification.created").contains("payload", { notification_id: n.id });
      assert.ok((data ?? []).some((r) => r.recipient_actor_id === B), "notification.created must target B");
    });
    await check("participant predicate: B in thread, D not", async () => {
      const inB = await db.rpc("is_conversation_participant", { p_conversation_id: conv, p_actor_id: B });
      const inD = await db.rpc("is_conversation_participant", { p_conversation_id: conv, p_actor_id: D });
      assert.equal(inB.data, true); assert.equal(inD.data, false);
    });
    await check("WEBHOOK leak-gate: D's fan-out excludes B's DM event; type-only WOULD leak it", async () => {
      // Replicate enqueueWebhooks' events query for a subscriber D on 'message.created'.
      const filtered = await db.from("events").select("id").eq("type", "message.created").contains("payload", { message_id: msgId }).or(`recipient_actor_id.eq.${D},recipient_actor_id.is.null`);
      const typeOnly = await db.from("events").select("id").eq("type", "message.created").contains("payload", { message_id: msgId }); // the pre-fix behaviour
      assert.equal((filtered.data ?? []).length, 0, "D must NOT be enqueued B's DM event");
      assert.ok((typeOnly.data ?? []).length > 0, "type-only match WOULD have leaked it — proves the recipient filter is load-bearing");
    });
  } finally {
    await cleanup();
  }
}

console.log(failed ? `\ncheck-messaging FAILED (${failed})` : "\ncheck-messaging passed");
process.exit(failed ? 1 : 0);
