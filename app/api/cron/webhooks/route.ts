import { assertWebhookEncryptionConfigured, deliverDueWebhooks, enqueueWebhooks } from "@/lib/services/webhooks";

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return new Response("Unauthorized", { status: 401 });
  try { assertWebhookEncryptionConfigured(); } catch { return new Response("Webhook delivery unavailable", { status: 503 }); }
  const queued = await enqueueWebhooks(); const delivered = await deliverDueWebhooks(); return Response.json({ ...queued, ...delivered });
}
