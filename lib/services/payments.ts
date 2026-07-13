import { createAdminClient } from "@/lib/supabase/admin";
import { ServiceError } from "@/lib/services/agents";

type StripeResponse = Record<string, unknown>;
export type StripeClient = { request: (path: string, form?: Record<string, string>, idempotencyKey?: string) => Promise<StripeResponse> };

export function stripeClient(secret = process.env.STRIPE_SECRET_KEY): StripeClient {
  if (!secret) throw new ServiceError(503, "Stripe is not configured");
  return { async request(path, form = {}, idempotencyKey) {
    const response = await fetch(`https://api.stripe.com/v1/${path}`, { method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/x-www-form-urlencoded", ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) }, body: new URLSearchParams(form) });
    const body = await response.json() as StripeResponse;
    if (!response.ok) throw new ServiceError(502, String((body.error as { message?: string } | undefined)?.message ?? "Stripe request failed"));
    return body;
  }};
}

function cents(amount: unknown) { const n = Number(amount); if (!Number.isFinite(n) || n < 0 || Math.round(n * 100) !== n * 100) throw new ServiceError(409, "Contract amount must be a non-negative two-decimal amount"); return Math.round(n * 100); }
async function contractForClient(actorId: string, contractId: string) {
  const { data, error } = await createAdminClient().from("contracts").select("id,client_actor_id,provider_actor_id,amount,status").eq("id", contractId).maybeSingle();
  if (error) throw new ServiceError(500, error.message); if (!data) throw new ServiceError(404, "Contract not found"); if (data.client_actor_id !== actorId) throw new ServiceError(403, "Only the contract client may manage escrow"); return data;
}
export async function createEscrow(actorId: string, contractId: string, client = stripeClient()) {
  const contract = await contractForClient(actorId, contractId); if (contract.status !== "active") throw new ServiceError(409, "Escrow can only be created for an active contract");
  const db = createAdminClient(); const { data: existing } = await db.from("escrows").select("*").eq("contract_id", contractId).maybeSingle(); if (existing) {
    if (existing.status === "pending") throw new ServiceError(409, "Escrow authorization is already pending");
    return existing;
  }
  const { data: destination } = await db.from("stripe_accounts").select("stripe_account_id,charges_enabled").eq("actor_id", contract.provider_actor_id).maybeSingle();
  if (!destination?.charges_enabled) throw new ServiceError(409, "Provider must finish Stripe onboarding before escrow");
  const intent = await client.request("payment_intents", { amount: String(cents(contract.amount)), currency: "usd", capture_method: "manual", "transfer_data[destination]": String(destination.stripe_account_id), "metadata[cognet_contract_id]": contractId }, `cognet-escrow-${contractId}`);
  const { data, error } = await db.from("escrows").insert({ contract_id: contractId, client_actor_id: actorId, provider_actor_id: contract.provider_actor_id, stripe_payment_intent_id: String(intent.id), amount_cents: cents(contract.amount), status: "pending" }).select().single();
  if (error?.code === "23505") { const { data: raced } = await db.from("escrows").select("*").eq("contract_id", contractId).single(); return raced; }
  if (error) throw new ServiceError(500, error.message); return { ...data, clientSecret: intent.client_secret };
}
async function escrowForClient(actorId: string, contractId: string) { await contractForClient(actorId, contractId); const { data, error } = await createAdminClient().from("escrows").select("*").eq("contract_id", contractId).maybeSingle(); if (error) throw new ServiceError(500, error.message); if (!data) throw new ServiceError(404, "Escrow not found"); return data; }
export async function releaseEscrow(actorId: string, contractId: string, client = stripeClient()) { const contract = await contractForClient(actorId, contractId); if (!['completed','resolved_completed'].includes(contract.status)) throw new ServiceError(409, "Contract must be completed before release"); const escrow = await escrowForClient(actorId, contractId); if (escrow.status === "released") return escrow; if (escrow.status !== "authorized") throw new ServiceError(409, "Escrow cannot be released"); await client.request(`payment_intents/${escrow.stripe_payment_intent_id}/capture`, {}, `cognet-release-${contractId}`); const { data, error } = await createAdminClient().from("escrows").update({ status: "released", released_at: new Date().toISOString() }).eq("id", escrow.id).select().single(); if (error) throw new ServiceError(500, error.message); return data; }
export async function cancelOrRefundEscrow(actorId: string, contractId: string, client = stripeClient()) { const contract = await contractForClient(actorId, contractId); if (!['cancelled','disputed','resolved_cancelled'].includes(contract.status)) throw new ServiceError(409, "Contract must be cancelled or disputed before funds can be returned"); const escrow = await escrowForClient(actorId, contractId); if (['cancelled','refunded'].includes(escrow.status)) return escrow; const released = escrow.status === "released"; await client.request(released ? "refunds" : `payment_intents/${escrow.stripe_payment_intent_id}/cancel`, released ? { payment_intent: escrow.stripe_payment_intent_id } : {}, `cognet-return-${contractId}`); const status = released ? "refunded" : "cancelled"; const { data, error } = await createAdminClient().from("escrows").update({ status, refunded_at: new Date().toISOString() }).eq("id", escrow.id).select().single(); if (error) throw new ServiceError(500, error.message); return data; }
export async function createConnectOnboarding(actorId: string, refreshUrl: string, returnUrl: string, client = stripeClient()) { const db = createAdminClient(); let { data: account } = await db.from("stripe_accounts").select("stripe_account_id").eq("actor_id", actorId).maybeSingle(); if (!account) { const created = await client.request("accounts", { type: "express", "metadata[cognet_actor_id]": actorId }, `cognet-account-${actorId}`); const { data, error } = await db.from("stripe_accounts").insert({ actor_id: actorId, stripe_account_id: String(created.id) }).select("stripe_account_id").single(); if (error) throw new ServiceError(500, error.message); account = data; } return client.request("account_links", { account: account.stripe_account_id, refresh_url: refreshUrl, return_url: returnUrl, type: "account_onboarding" }); }
export async function handleStripeEvent(event: { id: string; type: string; data?: { object?: Record<string, unknown> } }) { const db = createAdminClient(); const { error: inserted } = await db.from("webhook_deliveries").insert({ stripe_event_id: event.id, event_type: event.type, payload: event }); if (inserted?.code === "23505") return { duplicate: true }; if (inserted) throw new ServiceError(500, inserted.message); const object = event.data?.object ?? {}; if (event.type === "account.updated" && object.id) await db.from("stripe_accounts").update({ charges_enabled: Boolean(object.charges_enabled), payouts_enabled: Boolean(object.payouts_enabled), details_submitted: Boolean(object.details_submitted) }).eq("stripe_account_id", String(object.id)); if (event.type === "payment_intent.amount_capturable_updated" && object.id) await db.from("escrows").update({ status: "authorized" }).eq("stripe_payment_intent_id", String(object.id)).eq("status", "pending"); if (event.type === "payment_intent.payment_failed" && object.id) await db.from("escrows").update({ status: "failed" }).eq("stripe_payment_intent_id", String(object.id)).eq("status", "pending"); return { duplicate: false }; }
