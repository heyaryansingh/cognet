import { createHmac, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashSecret } from "@/lib/services/credentials";
import { ServiceError } from "@/lib/services/agents";

export async function createWebhookSubscription(actorId: string, input: { url: string; events: string[] }) {
  let url: URL; try { url = new URL(input.url); } catch { throw new ServiceError(422, "Invalid webhook URL"); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || host === "localhost" || host.endsWith(".local") || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || !input.events.length || input.events.some((event) => !/^[a-z]+\.[a-z_]+$/.test(event))) throw new ServiceError(422, "Webhook requires a public https URL and event names");
  const secret = randomBytes(24).toString("base64url"); const db = createAdminClient();
  const { data, error } = await db.from("webhook_subscriptions").insert({ actor_id: actorId, url: url.toString(), events: [...new Set(input.events)].slice(0, 20), secret_hash: hashSecret(secret) }).select("id,url,events,created_at").single();
  if (error) throw new ServiceError(500, error.message); return { subscription: data, secret };
}

export async function enqueueWebhooks() {
  const db = createAdminClient();
  const { data: events, error } = await db.from("events").select("id,type").order("id").limit(500); if (error) throw new ServiceError(500, error.message);
  let queued = 0; for (const event of events ?? []) { const { data: subscriptions } = await db.from("webhook_subscriptions").select("id").eq("active", true).contains("events", [event.type]); for (const subscription of subscriptions ?? []) { const { error: insert } = await db.from("outbound_webhook_deliveries").upsert({ subscription_id: subscription.id, event_id: event.id }, { onConflict: "subscription_id,event_id", ignoreDuplicates: true }); if (!insert) queued++; } } return { queued };
}

export async function deliverDueWebhooks(fetcher: typeof fetch = fetch) {
  const db = createAdminClient(); const { data, error } = await db.from("outbound_webhook_deliveries").select("id,attempts,event:events(id,type,actor_id,payload,created_at),subscription:webhook_subscriptions(url,secret_hash,active)").is("delivered_at", null).lte("next_attempt_at", new Date().toISOString()).order("id").limit(25); if (error) throw new ServiceError(500, error.message);
  let delivered = 0; for (const row of data ?? []) { const subscription = row.subscription as unknown as { url: string; secret_hash: string; active: boolean } | null; const event = row.event as unknown as Record<string, unknown> | null; if (!subscription?.active || !event) continue;
    // Secrets are show-once; delivery signature uses the hash as a stable server-side key.
    const body = JSON.stringify(event); const signature = createHmac("sha256", subscription.secret_hash).update(body).digest("hex");
    try { const response = await fetcher(subscription.url, { method: "POST", headers: { "content-type": "application/json", "x-cognet-signature": `sha256=${signature}` }, body, signal: AbortSignal.timeout(10_000) }); if (!response.ok) throw new Error(`HTTP ${response.status}`); await db.from("outbound_webhook_deliveries").update({ delivered_at: new Date().toISOString(), attempts: row.attempts + 1, last_error: null }).eq("id", row.id); delivered++; }
    catch (error) { const attempts = row.attempts + 1; await db.from("outbound_webhook_deliveries").update({ attempts, last_error: error instanceof Error ? error.message.slice(0, 500) : "delivery failed", next_attempt_at: new Date(Date.now() + Math.min(3600_000, 60_000 * 2 ** Math.min(attempts, 6))).toISOString() }).eq("id", row.id); }
  } return { delivered, attempted: (data ?? []).length };
}
