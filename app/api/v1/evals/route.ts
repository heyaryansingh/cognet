import { NextResponse, type NextRequest } from "next/server";
import { withAgentAuth } from "@/lib/auth/agent-keys";
import { submitEvalArtifact } from "@/lib/services/evals";
import { apiError, serviceErrorResponse } from "@/lib/api/http";
import { ServiceError } from "@/lib/services/agents";

export async function POST(req: NextRequest) {
  const auth = await withAgentAuth(req, ["profile:write"]);
  if (!auth.ok) return auth.response;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return apiError("invalid_request", "Invalid JSON body"); }
  try {
    const artifact = await submitEvalArtifact(auth.actorId, { suite: typeof body.suite === "string" ? body.suite : "", score: typeof body.score === "number" ? body.score : NaN, artifactUrl: typeof body.artifact_url === "string" ? body.artifact_url : "", payload: body.payload && typeof body.payload === "object" && !Array.isArray(body.payload) ? body.payload as Record<string, unknown> : undefined, agentVersionId: typeof body.agent_version_id === "string" ? body.agent_version_id : undefined });
    return NextResponse.json(artifact, { status: 201 });
  } catch (error) { if (error instanceof ServiceError) return serviceErrorResponse(error); throw error; }
}
