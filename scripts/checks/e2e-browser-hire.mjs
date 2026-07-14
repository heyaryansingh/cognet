// PREREQ: playwright-core + system Chrome (not in package.json - impl-1's file).
// Setup + rationale: coord/PLAYWRIGHT_NOTE.md. Run from a dir with playwright-core
// installed (e.g. npm i playwright-core @supabase/supabase-js in a scratch dir).
// HireModal browser-verify (impl-3 promise): flagship Hire button, real Chrome.
// Also regression-checks impl-1's early-submit fix (Next on Scope/Terms must
// NOT submit; only Review's "Send hire request" does).
import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";

const APP = process.env.APP ?? "http://localhost:3000";
const SUPA = "http://127.0.0.1:54321";
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
let humanActorId, agentActorId, agentHandle = `hire-tgt-${suffix}`;

await step("setup: human session + claimed target agent", async () => {
  await page.goto(`${APP}/auth/sign-up`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="display_name"]', `Hirer ${suffix}`);
  await page.fill('input[name="handle"]', `hirer-${suffix}`);
  await page.fill('input[name="email"]', `hirer-${suffix}@example.com`);
  await page.fill('input[name="password"]', `Hirer-${suffix}-1!`);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("sign-up"), { timeout: 20000 });
  const { data: h } = await db.from("actors").select("id").eq("handle", `hirer-${suffix}`).single();
  humanActorId = h.id;

  const reg = await fetch(`${APP}/api/v1/agents`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle: agentHandle, display_name: "Hire Target", pricing: { per_task: "$50" } }) });
  const rj = await reg.json();
  agentActorId = rj.profile?.actorId ?? rj.profile?.actor_id;
  if (!agentActorId) throw new Error(`register failed: ${JSON.stringify(rj).slice(0, 150)}`);
  await db.from("agents").update({ creator_actor_id: humanActorId }).eq("actor_id", agentActorId);
});

await step("Hire button opens modal", async () => {
  await page.goto(`${APP}/a/${agentHandle}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /^hire$/i }).click();
  await page.getByText("What do you need done?").waitFor({ timeout: 10000 });
});

await step("Next on Scope does NOT submit (early-submit regression)", async () => {
  await page.fill('input[name="title"]', `Hire-modal verify ${suffix}`);
  await page.fill('textarea[name="scope"]', "browser-verified hire");
  const urlBefore = page.url();
  await page.getByRole("button", { name: /^next$/i }).click();
  await page.waitForTimeout(800);
  if (page.url() !== urlBefore) throw new Error("navigated — submit fired early");
  const { count } = await db.from("contracts").select("id", { count: "exact", head: true }).eq("provider_actor_id", agentActorId);
  if ((count ?? 0) > 0) throw new Error("contract created before Review step");
});

await step("Terms -> Review advance clean", async () => {
  await page.fill('input[name="amount"]', "75");
  await page.getByRole("button", { name: /^next$/i }).click();
  await page.getByText(/Send hire request|Payment is/).first().waitFor({ timeout: 5000 });
  const { count } = await db.from("contracts").select("id", { count: "exact", head: true }).eq("provider_actor_id", agentActorId);
  if ((count ?? 0) > 0) throw new Error("contract created on Terms->Review advance");
});

await step("Send hire request creates contract + redirects", async () => {
  await page.getByRole("button", { name: /send hire request/i }).click();
  await page.waitForURL((u) => u.pathname !== `/a/${agentHandle}`, { timeout: 20000 }).catch(() => {});
  // DB truth regardless of redirect target
  const start = Date.now();
  let contract = null;
  while (Date.now() - start < 15000 && !contract) {
    const { data } = await db.from("contracts").select("id,client_actor_id,provider_actor_id,status,task_id,bid_id").eq("provider_actor_id", agentActorId).maybeSingle();
    contract = data; if (!contract) await new Promise((r) => setTimeout(r, 500));
  }
  if (!contract) throw new Error("no contract row after submit");
  if (contract.client_actor_id !== humanActorId) throw new Error("wrong client");
  if (contract.status !== "active") throw new Error(`status ${contract.status}`);
  if (!contract.task_id || !contract.bid_id) throw new Error("not transaction-backed");
});

await step("DM seam: conversation between hirer and agent exists", async () => {
  const { data: mine } = await db.from("conversation_participants").select("conversation_id").eq("participant_actor_id", humanActorId);
  const ids = (mine ?? []).map((c) => c.conversation_id);
  const { data: theirs } = await db.from("conversation_participants").select("conversation_id").eq("participant_actor_id", agentActorId).in("conversation_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  if (!theirs?.length) throw new Error("no shared conversation");
});

await browser.close();
console.log(failures ? `\nHIRE VERIFY: ${failures} FAILED` : "\nHIRE VERIFY: ALL GREEN");
process.exit(failures ? 1 : 0);
