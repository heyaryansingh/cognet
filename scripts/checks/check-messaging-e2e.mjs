#!/usr/bin/env node
// check-messaging-e2e (impl-4) — M1 ship-gate messaging legs, end-to-end through the LIVE app.
// Exercises the real HTTP surface: mint a stream:read key, open GET /api/v1/stream, emit outbox
// events, assert (1) a public event is delivered within ~2s and (2) another actor's PRIVATE event
// is NOT delivered (the leak gate, proven over the wire, not just the DB).
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_URL (default http://127.0.0.1:3000).
// Requires the Next app + Supabase stack running. Non-zero exit on failure.

import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
import assert from "node:assert/strict";

const DB_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = process.env.APP_URL ?? "http://127.0.0.1:3000";
assert(DB_URL && KEY, "SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required");

const db = createClient(DB_URL, KEY, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = `e2e-${Date.now()}`;
let failed = 0;
const check = (name, ok, detail = "") => { if (ok) console.log(`  ok  - ${name}`); else { failed++; console.error(`  FAIL- ${name}${detail ? ": " + detail : ""}`); } };

let me, other, keyId, controller;
const mkActor = async (suffix) => {
  const { data, error } = await db.from("actors").insert({ type: "agent", handle: `${tag}-${suffix}`.slice(0, 40), display_name: `e2e-${suffix}` }).select("id").single();
  if (error) throw new Error(`seed ${suffix}: ${error.message}`);
  await db.from("agents").insert({ actor_id: data.id, creator_actor_id: data.id }); // claimed
  return data.id;
};

try {
  me = await mkActor("me");
  other = await mkActor("other");

  // Mint a stream:read key matching withAgentAuth's format: cgt_<8-char prefix><secret>, sha256 at rest.
  const prefix = "e2estrm1"; // 8 chars => key.slice(4,12)
  const secret = randomBytes(24).toString("hex");
  const apiKey = `cgt_${prefix}${secret}`;
  const key_hash = createHash("sha256").update(apiKey).digest("hex");
  const { data: keyRow, error: keyErr } = await db.from("api_keys").insert({ agent_actor_id: me, key_prefix: prefix, key_hash, scopes: ["stream:read"] }).select("id").single();
  if (keyErr) throw new Error(`mint key: ${keyErr.message}`);
  keyId = keyRow.id;

  // Open the SSE stream.
  controller = new AbortController();
  const res = await fetch(`${APP}/api/v1/stream`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: controller.signal });
  check("GET /api/v1/stream authorizes stream:read key (200)", res.status === 200, `got ${res.status}`);

  const received = [];
  const decoder = new TextDecoder();
  const reader = res.body.getReader();
  let buf = "";
  const readLoop = (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let sep;
        while ((sep = buf.indexOf("\n\n")) !== -1) {
          const frame = buf.slice(0, sep); buf = buf.slice(sep + 2);
          const evt = frame.split("\n").find((l) => l.startsWith("event: "));
          if (evt) received.push(evt.slice(7).trim());
        }
      }
    } catch { /* aborted */ }
  })();

  await sleep(600); // let the stream establish + emit its retry/keepalive

  // Emit one PUBLIC event (recipient NULL — every stream sees it) and one PRIVATE event addressed
  // to `other` (my stream must NOT see it).
  await db.rpc("emit_event", { p_type: "post.created", p_actor_id: me, p_payload: { e2e: tag }, p_recipient_actor_id: null });
  await db.rpc("emit_event", { p_type: "message.created", p_actor_id: other, p_payload: { e2e: tag }, p_recipient_actor_id: other });

  // Poll ~2s cadence => allow up to 5s for delivery.
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && !received.includes("post.created")) await sleep(200);

  check("SSE delivers public post.created within ~2s", received.includes("post.created"), `frames=${JSON.stringify(received)}`);
  check("LEAK GATE (over the wire): my stream EXCLUDES another actor's private message.created", !received.includes("message.created"), `frames=${JSON.stringify(received)}`);

  controller.abort();
  await Promise.race([readLoop, sleep(500)]);
} finally {
  if (controller) try { controller.abort(); } catch { /* noop */ }
  // cleanup: events, keys, agents, actors for the test tag
  for (const id of [me, other].filter(Boolean)) {
    await db.from("events").delete().or(`actor_id.eq.${id},recipient_actor_id.eq.${id}`);
    await db.from("api_keys").delete().eq("agent_actor_id", id);
    await db.from("agents").delete().eq("actor_id", id);
    await db.from("actors").delete().eq("id", id);
  }
}

console.log(failed ? `\ncheck-messaging-e2e FAILED (${failed})` : "\ncheck-messaging-e2e passed");
process.exit(failed ? 1 : 0);
