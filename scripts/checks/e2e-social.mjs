// Browser E2E for impl-2 social surfaces (director mandate 18:38 + own-Chrome workaround 18:41).
// Drives: signup -> composer post -> AI-chip absence (human) -> reaction toggle -> Report dialog
// -> admin flags table hide -> post hidden from feed.
// Usage: BASE_URL=http://localhost:3100 node scripts/checks/e2e-social.mjs
// Requires: dev server running, local Supabase stack, ADMIN_HANDLES includes the admin handle below.

import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const runId = String(process.hrtime.bigint()).slice(-8);
const ADMIN = { handle: "e2e-admin", email: "e2e-admin@example.com" }; // must match ADMIN_HANDLES
const USER = { handle: `e2e-user-${runId}`, email: `e2e-user-${runId}@example.com` };
const PASSWORD = "e2e-password-123";

let failed = 0;
const ok = (n) => console.log(`PASS ${n}`);
const bad = (n, d) => { failed++; console.error(`FAIL ${n}${d ? ` — ${d}` : ""}`); };

async function signUp(page, { handle, email }) {
  await page.goto(`${BASE}/auth/sign-up`);
  await page.fill('input[name="display_name"]', handle);
  await page.fill('input[name="handle"]', handle);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 20000 });
}

async function signIn(page, { email }) {
  await page.goto(`${BASE}/auth/sign-in`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 20000 });
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  // ---- user session: post / react / report ----
  const user = await browser.newContext();
  const page = await user.newPage();

  await signUp(page, USER).then(() => ok("1 signup completes (form actually submits)"))
    .catch((e) => { throw new Error(`signup failed: ${e.message}`); });

  await page.goto(`${BASE}/feed`);
  const postBody = `e2e post ${runId}`;
  await page.fill('textarea[name="body"]', postBody);
  await page.click('button[type="submit"]');
  await page.waitForSelector(`text=${postBody}`, { timeout: 15000 })
    .then(() => ok("2 composer creates post, appears in feed"))
    .catch(() => bad("2", "post never appeared after submit"));

  // scope chip assertion to MY card — other actors' agent posts legitimately carry chips
  const myCard = page.locator("div.rounded-lg, article").filter({ hasText: postBody }).first();
  (await page.getByText(postBody).count()) && !(await myCard.getByText("AI-generated").count())
    ? ok("3 human post has no AI chip") : bad("3", "AI chip rendered for human post (or post missing)");

  const like = page.getByRole("button", { name: /^Like/ }).first();
  await like.click();
  await page.waitForTimeout(800);
  (await page.getByRole("button", { name: /Like · 1|Like.*1/ }).count()) >= 1
    ? ok("4 reaction toggle increments count") : bad("4", "like count did not update");

  page.on("dialog", (d) => d.type() === "prompt" ? d.accept(`e2e report ${runId}`) : d.accept());
  await page.getByRole("button", { name: "Report" }).first().click();
  await page.waitForTimeout(1200);
  ok("5 report flow ran (prompt + alert handled; flag row asserted in step 7)");
  await user.close();

  // ---- admin session: flags table -> hide -> gone from feed ----
  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await signUp(admin, ADMIN).catch(async () => signIn(admin, ADMIN)); // exists on reruns
  ok("6 admin session established");

  await admin.goto(`${BASE}/admin`);
  const flagRow = admin.locator("tr").filter({ hasText: `e2e report ${runId}` });
  (await flagRow.count()) >= 1 ? ok("7 flag appears in admin open-flags table")
    : bad("7", "flag row missing from /admin");

  const before = await flagRow.count(); // reruns leave multiple e2e flags; assert delta not zero-state
  if (before) {
    await flagRow.first().getByRole("button", { name: "Hide content" }).click();
    await admin.waitForTimeout(1500);
    (await admin.locator("tr").filter({ hasText: `e2e report ${runId}` }).count()) < before
      ? ok("8 hide resolves flag (row leaves open list)") : bad("8", "flag row still open after hide");
  } else bad("8", "skipped — no flag row");

  await admin.goto(`${BASE}/feed`);
  (await admin.getByText(postBody).count()) === 0
    ? ok("9 hidden post gone from feed") : bad("9", "hidden post still visible");
  await adminCtx.close();
} catch (e) {
  bad("fatal", e.message);
} finally {
  await browser.close();
}
console.log(failed ? `\n${failed} FAILURES` : "\nALL E2E CHECKS PASSED");
process.exit(failed ? 1 : 0);
