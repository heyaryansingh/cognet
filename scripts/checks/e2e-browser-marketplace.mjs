// PREREQ: playwright-core + system Chrome (not in package.json - impl-1's file).
// Setup + rationale: coord/PLAYWRIGHT_NOTE.md. Run from a dir with playwright-core
// installed (e.g. npm i playwright-core @supabase/supabase-js in a scratch dir).
// True-UI browser pass (director 18:34 assignment): post-task submit +
// accept-bid button must actually fire in a real browser.
import { chromium } from "playwright-core";

const APP = process.env.APP ?? "http://localhost:3000";
const SUPA = "http://127.0.0.1:54321";
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const suffix = Math.random().toString(36).slice(2, 8);
const log = (s) => console.log(s);

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
let failures = 0;
const step = async (name, fn) => {
  try { await fn(); log(`PASS  ${name}`); } catch (e) { failures++; log(`FAIL  ${name}: ${e.message.split("\n")[0]}`); }
};

let taskUrl, taskId;

await step("UI signup + session", async () => {
  await page.goto(`${APP}/auth/sign-up`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="display_name"]', `Browser Human ${suffix}`);
  await page.fill('input[name="handle"]', `bh-${suffix}`);
  await page.fill('input[name="email"]', `bh-${suffix}@example.com`);
  await page.fill('input[name="password"]', `Browser-${suffix}-1!`);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("sign-up"), { timeout: 20000 });
});

await step("post-task submit fires (true UI)", async () => {
  await page.goto(`${APP}/tasks/new`, { waitUntil: "domcontentloaded" });
  if (page.url().includes("sign-in")) throw new Error("bounced to sign-in — no session");
  await page.fill("#title", `Browser task ${suffix}`);
  await page.fill("#body", "posted from real browser");
  await page.fill("#tags", "browser,smoke");
  await page.click("form button");
  await page.waitForURL(/\/tasks\/[0-9a-f-]{36}$/, { timeout: 20000 });
  taskUrl = page.url();
  taskId = taskUrl.split("/").pop();
});

await step("seed agent bid via API", async () => {
  const reg = await fetch(`${APP}/api/v1/agents`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle: `bw-agent-${suffix}`, display_name: "Browser Bidder" }) });
  const rj = await reg.json();
  const key = rj.api_key ?? rj.apiKey ?? rj.key;
  const actorId = rj.profile?.actorId ?? rj.profile?.actor_id;
  if (!key) throw new Error(`no key: ${JSON.stringify(rj).slice(0, 120)}`);
  // owner-console simulation: claim + working scopes
  const sb = (await import("@supabase/supabase-js")).createClient(SUPA, SVC, { auth: { persistSession: false } });
  await sb.from("agents").update({ creator_actor_id: actorId }).eq("actor_id", actorId);
  await sb.from("api_keys").update({ scopes: ["bids:write"] }).eq("agent_actor_id", actorId);
  const bid = await fetch(`${APP}/api/v1/tasks/${taskId}/bids`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify({ amount: 42, proposal: "browser-pass bid" }) });
  if (bid.status !== 201) throw new Error(`bid ${bid.status}: ${JSON.stringify(await bid.json()).slice(0, 150)}`);
});

await step("accept-bid button fires (true UI)", async () => {
  await page.goto(taskUrl, { waitUntil: "domcontentloaded" });
  const btn = page.getByRole("button", { name: /accept bid/i });
  await btn.first().waitFor({ timeout: 10000 });
  await btn.first().click();
  await page.waitForFunction(() => document.body.innerText.toLowerCase().includes("assigned"), null, { timeout: 20000 });
});

await step("UI reflects contract state", async () => {
  const text = await page.innerText("body");
  if (!/accepted/i.test(text)) throw new Error("no accepted bid state visible");
});

await browser.close();
log(failures === 0 ? "\nBROWSER PASS: ALL GREEN" : `\nBROWSER PASS: ${failures} FAILED`);
process.exit(failures ? 1 : 0);
