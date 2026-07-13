import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashSecret } from "@/lib/services/credentials";
import { ServiceError } from "@/lib/services/agents";

const encryptionKey = () => {
  const value = process.env.COGNET_WEBHOOK_ENCRYPTION_KEY;
  const key = value ? Buffer.from(value, "base64url") : null;
  if (!key || key.length !== 32) throw new ServiceError(503, "Webhook delivery encryption is not configured");
  return key;
};

export function assertWebhookEncryptionConfigured() { encryptionKey(); }

function encryptSecret(secret: string) {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  return `v1.${iv.toString("base64url")}.${cipher.update(secret, "utf8", "base64url")}${cipher.final("base64url")}.${cipher.getAuthTag().toString("base64url")}`;
}

function decryptSecret(ciphertext: string) {
  const [version, iv, body, tag] = ciphertext.split(".");
  if (version !== "v1" || !iv || !body || !tag) throw new ServiceError(503, "Webhook secret cannot be decrypted");
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return decipher.update(body, "base64url", "utf8") + decipher.final("utf8");
  } catch { throw new ServiceError(503, "Webhook secret cannot be decrypted"); }
}

export async function createWebhookSubscription(actorId: string, input: { url: string; events: string[] }) {
  let url: URL; try { url = new URL(input.url); } catch { throw new ServiceError(422, "Invalid webhook URL"); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || host === "localhost" || host.endsWith(".local") || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || !input.events.length || input.events.some((event) => !/^[a-z]+\.[a-z_]+$/.test(event))) throw new ServiceError(422, "Webhook requires a public https URL and event names");
  const secret = randomBytes(24).toString("base64url"); const db = createAdminClient();
  const { data, error } = await db.from("webhook_subscriptions").insert({ actor_id: actorId, url: url.toString(), events: [...new Set(input.events)].slice(0, 20), secret_hash: hashSecret(secret), secret_ciphertext: encryptSecret(secret) }).select("id,url,events,created_at").single();
  if (error) throw new ServiceError(500, error.message); return { subscription: data, secret };
}

export async function enqueueWebhooks() {
  const db = createAdminClient();
  const { data: subscriptions, error } = await db.from("webhook_subscriptions").select("id,actor_id,events,last_enqueued_event_id").eq("active", true).order("last_enqueued_event_id").order("id");
  if (error) throw new ServiceError(500, error.message);
  let queued = 0;
  for (const subscription of subscriptions ?? []) {
    // A17.3 (CRITICAL leak gate): outbox consumers MUST filter recipient — a subscriber only
    // gets events addressed to their actor OR public (recipient NULL). Same predicate as
    // lib/services/events.ts; type-only matching leaks private DMs/bids cross-actor.
    const { data: events, error: eventsError } = await db.from("events").select("id").gt("id", subscription.last_enqueued_event_id).in("type", subscription.events).or(`recipient_actor_id.eq.${subscription.actor_id},recipient_actor_id.is.null`).order("id").limit(500);
    if (eventsError) throw new ServiceError(500, eventsError.message);
    if (!events?.length) continue;
    const { error: insertError } = await db.from("outbound_webhook_deliveries").upsert(events.map((event) => ({ subscription_id: subscription.id, event_id: event.id })), { onConflict: "subscription_id,event_id", ignoreDuplicates: true });
    if (insertError) throw new ServiceError(500, insertError.message);
    const cursor = events[events.length - 1].id;
    const { error: cursorError } = await db.from("webhook_subscriptions").update({ last_enqueued_event_id: cursor }).eq("id", subscription.id).lte("last_enqueued_event_id", cursor);
    if (cursorError) throw new ServiceError(500, cursorError.message);
    queued += events.length;
  }
  return { queued };
}

export async function deliverDueWebhooks(fetcher: typeof fetch = fetch) {
  assertWebhookEncryptionConfigured();
  const db = createAdminClient(); const { data, error } = await db.from("outbound_webhook_deliveries").select("id,attempts,event:events(id,type,actor_id,payload,created_at),subscription:webhook_subscriptions(url,secret_ciphertext,active)").is("delivered_at", null).lte("next_attempt_at", new Date().toISOString()).order("id").limit(25); if (error) throw new ServiceError(500, error.message);
  let delivered = 0; for (const row of data ?? []) { const subscription = row.subscription as unknown as { url: string; secret_ciphertext: string | null; active: boolean } | null; const event = row.event as unknown as Record<string, unknown> | null; if (!subscription?.active || !event) continue;
    // A NULL secret must NOT throw out of the loop — that poison-pills the whole batch and
    // every subsequent cron run halts on the same row. Mark this delivery failed + back off,
    // then continue so healthy subscriptions still deliver.
    if (!subscription.secret_ciphertext) {
      await db.from("outbound_webhook_deliveries").update({ attempts: row.attempts + 1, last_error: "subscription missing secret_ciphertext", next_attempt_at: new Date(Date.now() + 3600_000).toISOString() }).eq("id", row.id);
      continue;
    }
    const body = JSON.stringify(event); const signature = createHmac("sha256", decryptSecret(subscription.secret_ciphertext)).update(body).digest("hex");
    try { const response = await fetcher(subscription.url, { method: "POST", headers: { "content-type": "application/json", "x-cognet-signature": `sha256=${signature}` }, body, signal: AbortSignal.timeout(10_000) }); if (!response.ok) throw new Error(`HTTP ${response.status}`); await db.from("outbound_webhook_deliveries").update({ delivered_at: new Date().toISOString(), attempts: row.attempts + 1, last_error: null }).eq("id", row.id); delivered++; }
    catch (error) { const attempts = row.attempts + 1; await db.from("outbound_webhook_deliveries").update({ attempts, last_error: error instanceof Error ? error.message.slice(0, 500) : "delivery failed", next_attempt_at: new Date(Date.now() + Math.min(3600_000, 60_000 * 2 ** Math.min(attempts, 6))).toISOString() }).eq("id", row.id); }
  } return { delivered, attempted: (data ?? []).length };
}
