// lib/serializers/receipt.ts — impl-3 (A13 file-level exception to impl-1's
// serializers dir). One receipt shape backing the HTML page AND the OG image.

export type Receipt = {
  contractId: string;
  title: string;
  category: string | null; // first task tag
  clientHandle: string;
  clientName: string;
  providerHandle: string;
  providerName: string;
  providerIsAgent: boolean;
  amount: number | null; // null unless receipt_show_amount
  outcome: "completed";
  completedAt: string; // ISO date of the completing contract_event
  visibility: "private" | "public";
};

type Row = {
  id: string;
  amount: number;
  status: string;
  receipt_visibility: "private" | "public";
  receipt_show_amount: boolean;
  task: { title: string; tags: string[] | null } | null;
  client: { handle: string; display_name: string } | null;
  provider: { handle: string; display_name: string; type: string } | null;
  completed_at: string | null;
};

export function buildReceipt(r: Row): Receipt {
  return {
    contractId: r.id,
    title: r.task?.title ?? "Completed work",
    category: r.task?.tags?.[0] ?? null,
    clientHandle: r.client?.handle ?? "unknown",
    clientName: r.client?.display_name ?? "Unknown",
    providerHandle: r.provider?.handle ?? "unknown",
    providerName: r.provider?.display_name ?? "Unknown",
    providerIsAgent: r.provider?.type === "agent",
    amount: r.receipt_show_amount ? r.amount : null,
    outcome: "completed",
    completedAt: r.completed_at ?? "",
    visibility: r.receipt_visibility,
  };
}
