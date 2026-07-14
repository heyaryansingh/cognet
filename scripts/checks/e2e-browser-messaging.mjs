// PREREQ: playwright-core + system Chrome (setup + rationale: coord/PLAYWRIGHT_NOTE.md).
// Run from a dir with playwright-core + @supabase/supabase-js installed.
// Messaging browser-verify (impl-4): DM thread + AC1 realtime. Regression-guards the last
// M1 functional bug (live DM without refresh), which needed BOTH 0021 (is_conversation_participant
// RLS-helper grant) AND thread-client onAuthStateChange socket auth. Also checks the participant
// name resolves (not "Unknown") and the Send composer submits.
import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";

const APP = process.env.APP ?? "http://localhost:3000";
const SUPA = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const suffix = Math.random().toString(36).slice(2, 8);
const db = createClient(SUPA, SVC, { auth: { persistSession: false } });

let failures = 0;
const step = async (name, fn) => {
  try { await fn(); console.log(`PASS  ${name}`); }
  catch (e) { failures++; console.log(`FAIL  ${name}: ${e.message.split("\n")[0]}`); }
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
let humanActorId, agentActorId, conv;

try {
  await step("setup: human session (UI signup) + claimed peer agent + DM", async () => {
    await page.goto(`${APP}/auth/sign-up`, { waitUntil: "domcontentloaded" });
    await page.fill('input[name="display_name"]', `Msgr ${suffix}`);
    await page.fill('input[name="handle"]', `msgr-${suffix}`);
    await page.fill('input[name="email"]', `msgr-${suffix}@example.com`);
    await page.fill('input[name="password"]', `Msgr-${suffix}-1!`);
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.includes("sign-up"), { timeout: 20000 });
    const { data: h } = await db.from("actors").select("id").eq("handle", `msgr-${suffix}`).single();
    humanActorId = h.id;

    const { data: a } = await db.from("actors").insert({ type: "agent", handle: `msgpeer-${suffix}`, display_name: "Msg Peer Agent" }).select("id").single();
    agentActorId = a.id;
    await db.from("agents").insert({ actor_id: agentActorId, creator_actor_id: humanActorId });
    const { data: c, error } = await db.rpc("get_or_create_dm", { p_acting_actor_id: humanActorId, p_other_actor_id: agentActorId });
    if (error) throw new Error(error.message);
    conv = c;
    await db.from("messages").insert({ conversation_id: conv, sender_actor_id: agentActorId, body: "Opening line from peer." });
  });

  await step("thread loads + peer message renders (0021 RLS-helper grant)", async () => {
    await page.goto(`${APP}/messages/${conv}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction((t) => document.body.innerText.includes(t), "Opening line from peer.", { timeout: 15000 });
  });

  await step("peer sender name resolves (not 'Unknown')", async () => {
    const ok = await page.evaluate(() => document.body.innerText.includes("Msg Peer Agent"));
    if (!ok) throw new Error("sender shows Unknown — participant read failed");
  });

  await step("AC1: peer message appears LIVE without refresh (onAuthStateChange + 0021)", async () => {
    await new Promise((r) => setTimeout(r, 1500)); // let the realtime socket subscribe
    const live = `live realtime ${suffix}`;
    await db.from("messages").insert({ conversation_id: conv, sender_actor_id: agentActorId, body: live });
    await page.waitForFunction((t) => document.body.innerText.includes(t), live, { timeout: 8000 });
  });

  await step("composer Send submits (P1 button + persists)", async () => {
    const mine = `human reply ${suffix}`;
    await page.getByRole("textbox", { name: "Write a message…" }).fill(mine);
    await page.getByRole("button", { name: "Send" }).click();
    await page.waitForFunction((t) => document.body.innerText.includes(t), mine, { timeout: 8000 });
  });
} finally {
  await browser.close();
  if (conv) await db.from("conversations").delete().eq("id", conv);
  for (const id of [humanActorId, agentActorId].filter(Boolean)) {
    await db.from("events").delete().or(`actor_id.eq.${id},recipient_actor_id.eq.${id}`);
    await db.from("agents").delete().eq("actor_id", id);
    await db.from("actors").delete().eq("id", id);
  }
}

console.log(failures ? `\nFAILED (${failures})` : "\ne2e-browser-messaging PASSED");
process.exit(failures ? 1 : 0);
