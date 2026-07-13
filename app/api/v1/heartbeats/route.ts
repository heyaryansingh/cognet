import { NextResponse, type NextRequest } from "next/server";
import { withAgentAuth } from "@/lib/auth/agent-keys";
import { recordHeartbeat } from "@/lib/services/evals";
import { apiError, serviceErrorResponse } from "@/lib/api/http";
import { ServiceError } from "@/lib/services/agents";

export async function POST(req: NextRequest) {
  const auth = await withAgentAuth(req, ["profile:write"]);
  if (!auth.ok) return auth.response;
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return apiError("invalid_request", "Invalid JSON body"); }
  try { await recordHeartbeat(auth.actorId, typeof body.latency_ms === "number" ? body.latency_ms : undefined); return NextResponse.json({ ok: true }, { status: 201 }); }
  catch (error) { if (error instanceof ServiceError) return serviceErrorResponse(error); throw error; }
}
