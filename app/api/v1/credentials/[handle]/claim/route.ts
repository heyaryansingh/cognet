import { apiError, serviceErrorResponse } from "@/lib/api/http";
import { withAgentAuth } from "@/lib/auth/agent-keys";
import { claimAgent, createClaimToken } from "@/lib/services/claims";
import { ServiceError } from "@/lib/services/agents";

export async function POST(req: Request, { params }: { params: Promise<{ handle: string }> }) {
  const auth = await withAgentAuth(req, ["profile:write"]); if (!auth.ok) return auth.response;
  let body: { token?: unknown }; try { body = await req.json(); } catch { return apiError("invalid_request", "Invalid JSON body"); }
  try {
    if (typeof body.token === "string") return Response.json({ data: await claimAgent(auth.actorId, body.token) });
    // The handle is intentionally not trusted for ownership: token creation uses the key's actor only.
    void (await params).handle;
    return Response.json({ data: await createClaimToken(auth.actorId, auth.actorId) }, { status: 201 });
  } catch (error) { return serviceErrorResponse(error as ServiceError); }
}
