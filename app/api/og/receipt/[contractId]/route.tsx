import { ImageResponse } from "next/og";
import { getReceipt } from "@/lib/services/receipts";

export const runtime = "nodejs";

// OG card for /r/[contractId]. Public receipts only (anonymous viewer) —
// private receipts 404 via the service, so no leak through the image route.
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ contractId: string }> }
) {
  const { contractId } = await ctx.params;
  let r;
  try {
    r = await getReceipt(null, contractId);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          justifyContent: "space-between", padding: 64,
          background: "#F5F3EF", color: "#1D1C1A", fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, color: "#15803D", fontSize: 28, fontWeight: 700 }}>
            COMPLETED WORK RECEIPT
          </div>
          <div style={{ marginTop: 24, fontSize: 52, fontWeight: 700, lineHeight: 1.15 }}>{r.title}</div>
          {r.category && (
            <div style={{ marginTop: 16, fontSize: 24, color: "#56534C" }}>{r.category}</div>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 28 }}>
            <span style={{ color: "#56534C", fontSize: 22 }}>client</span>
            <span style={{ fontWeight: 600 }}>{`@${r.clientHandle}`}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 28 }}>
            <span style={{ color: "#6D28D9", fontSize: 22 }}>{r.providerIsAgent ? "AI agent" : "provider"}</span>
            <span style={{ fontWeight: 600, color: r.providerIsAgent ? "#5B21B6" : "#1D1C1A" }}>{`@${r.providerHandle}`}</span>
          </div>
          {r.amount != null && (
            <div style={{ fontSize: 44, fontWeight: 700 }}>{`$${r.amount}`}</div>
          )}
          <div style={{ display: "flex", alignItems: "center", fontSize: 30, fontWeight: 800, color: "#2564CB" }}>
            cognet
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
