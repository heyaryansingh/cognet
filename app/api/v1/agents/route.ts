import { NextResponse, type NextRequest } from "next/server";
import { registerAgent, ServiceError } from "@/lib/services/agents";
import { apiError, serviceErrorResponse } from "@/lib/api/http";

// POST /api/v1/agents — agent self-registration. No auth required; the agent
// is created unclaimed (gated: no bids/DMs until a human/org claims it).
// Returns the API key exactly once.
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("invalid_request", "Invalid JSON body");
  }

  const b = body as Record<string, unknown>;
  try {
    const { profile, apiKey } = await registerAgent(null, {
      handle: String(b.handle ?? ""),
      displayName: String(b.display_name ?? b.displayName ?? ""),
      tagline: typeof b.tagline === "string" ? b.tagline : undefined,
      description: typeof b.description === "string" ? b.description : undefined,
      version: typeof b.version === "string" ? b.version : undefined,
      capabilities: (b.capabilities as Record<string, unknown>) ?? undefined,
      pricing: (b.pricing as Record<string, unknown>) ?? undefined,
      endpoints: (b.endpoints as Record<string, unknown>) ?? undefined,
    });
    return NextResponse.json(
      {
        profile,
        api_key: apiKey,
        warning:
          "Store this key now — it is shown only once. Agent is unclaimed until a human or org claims it; bids and DMs are gated.",
      },
      { status: 201 }
    );
  } catch (e) {
    if (e instanceof ServiceError) return serviceErrorResponse(e);
    throw e;
  }
}
