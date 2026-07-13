// lib/services/receipts.ts — impl-3 work-receipts v0 (A13).
// Receipt exists only for completed contracts. Private by default; either
// party may publish (both parties get share links per the PRD — the receipt
// is their shared work record). Unsigned at M1.

import { createAdminClient } from "@/lib/supabase/admin";
import { ServiceError } from "@/lib/services/agents";
import { buildReceipt, type Receipt } from "@/lib/serializers/receipt";

const COMPLETED = ["completed", "resolved_completed"];

const SELECT =
  "id,amount,status,receipt_visibility,receipt_show_amount,client_actor_id,provider_actor_id," +
  "task:tasks!contracts_task_id_fkey(title,tags)," +
  "client:actors!contracts_client_actor_id_fkey(handle,display_name)," +
  "provider:actors!contracts_provider_actor_id_fkey(handle,display_name,type)";

type ReceiptRow = {
  id: string; amount: number; status: string;
  receipt_visibility: "private" | "public"; receipt_show_amount: boolean;
  client_actor_id: string; provider_actor_id: string;
  task: { title: string; tags: string[] | null } | null;
  client: { handle: string; display_name: string } | null;
  provider: { handle: string; display_name: string; type: string } | null;
};

async function load(contractId: string) {
  const db = createAdminClient();
  const { data: raw, error } = await db.from("contracts").select(SELECT).eq("id", contractId).maybeSingle();
  if (error) throw new ServiceError(500, error.message);
  if (!raw) throw new ServiceError(404, "Receipt not found");
  const data = raw as unknown as ReceiptRow;
  if (!COMPLETED.includes(data.status)) throw new ServiceError(404, "Receipt not found"); // no receipts for open work
  const { data: done } = await db
    .from("contract_events")
    .select("created_at")
    .eq("contract_id", contractId)
    .in("to_status", COMPLETED)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { row: { ...data, completed_at: done?.created_at ?? null }, db };
}

/** Public receipt or party view. viewerActorId null = anonymous. */
export async function getReceipt(viewerActorId: string | null, contractId: string): Promise<Receipt & { isParty: boolean }> {
  const { row } = await load(contractId);
  const isParty = !!viewerActorId && [row.client_actor_id, row.provider_actor_id].includes(viewerActorId);
  if (row.receipt_visibility !== "public" && !isParty) throw new ServiceError(404, "Receipt not found"); // private receipts 404, not 403 — don't leak contract existence
  return { ...buildReceipt(row as never), isParty };
}

export async function publishReceipt(
  actingActorId: string,
  contractId: string,
  opts: { showAmount?: boolean; visibility?: "private" | "public" } = {}
): Promise<Receipt> {
  const { row, db } = await load(contractId);
  if (![row.client_actor_id, row.provider_actor_id].includes(actingActorId)) {
    throw new ServiceError(403, "Only contract parties may manage the receipt");
  }
  const visibility = opts.visibility ?? "public";
  const { data, error } = await db
    .from("contracts")
    .update({ receipt_visibility: visibility, receipt_show_amount: opts.showAmount ?? false })
    .eq("id", contractId)
    .select(SELECT)
    .single();
  if (error) throw new ServiceError(500, error.message);
  if (visibility === "public" && row.receipt_visibility !== "public") {
    // A12 registry: receipt.published, recipient NULL (public)
    await db.rpc("emit_event", {
      p_type: "receipt.published",
      p_actor_id: actingActorId,
      p_payload: { contract_id: contractId },
    });
  }
  const updated = data as unknown as ReceiptRow;
  return buildReceipt({ ...updated, completed_at: row.completed_at } as never);
}
