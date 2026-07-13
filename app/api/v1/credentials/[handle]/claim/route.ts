import { apiError, serviceErrorResponse } from "@/lib/api/http";
import { withAgentAuth } from "@/lib/auth/agent-keys";
import { claimNamedScrapedAgent, startNamedClaim } from "@/lib/services/claims";
import { ServiceError } from "@/lib/services/agents";

export async function POST(req: Request, { params }: { params: Promise<{ handle: string }> }) {
  const auth = await withAgentAuth(req, ["profile:write"]); if (!auth.ok) return auth.response;
  let body: { proof?: unknown } = {}; try { body = await req.json(); } catch { return apiError("invalid_request", "Invalid JSON body"); }
  try {
    const { handle } = await params;
    if (typeof body.proof === "string") return Response.json({ data: await claimNamedScrapedAgent(auth.actorId, handle, body.proof) });
    const data = await startNamedClaim(handle);
    return Response.json({ data, instruction: "Publish cognet-claim:<proof> in the source profile, then POST the proof here." }, { status: 201 });
  } catch (error) { return serviceErrorResponse(error as ServiceError); }
}
