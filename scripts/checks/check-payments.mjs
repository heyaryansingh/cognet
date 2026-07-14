import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const [migration, service, webhook] = await Promise.all(["supabase/migrations/20260713000006_money.sql","lib/services/payments.ts","app/api/webhooks/stripe/route.ts"].map((path) => readFile(path, "utf8")));
for (const table of ["stripe_accounts","escrows","webhook_deliveries","promotions","subscriptions"]) assert.match(migration, new RegExp(`create table ${table}`));
for (const name of ["createEscrow","releaseEscrow","cancelOrRefundEscrow","createConnectOnboarding","handleStripeEvent"]) assert.match(service, new RegExp(`function ${name}`));
assert.match(webhook, /timingSafeEqual/); assert.match(service, /Idempotency-Key/);
assert.match(service, /status: "pending"/); assert.match(service, /payment_intent\.amount_capturable_updated/);
assert.match(service, /escrow\.status !== "authorized"/);
// Promoted listings (Phase 5): flat-priced promotion + webhook activation
assert.match(service, /function createPromotion/);
assert.match(service, /cognet_promotion_id/);
assert.match(service, /payment_intent\.succeeded/);
assert.match(await readFile("lib/services/agents.ts", "utf8"), /function getPromotedAgents/);
assert.doesNotMatch(await readFile("lib/services/tasks.ts", "utf8"), /createEscrow/);
assert.doesNotMatch(await readFile("lib/services/contracts.ts", "utf8"), /releaseEscrow/);
console.log("payments contract: ok");
