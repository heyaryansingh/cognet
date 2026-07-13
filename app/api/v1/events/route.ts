import { NextRequest, NextResponse } from "next/server";
import { withAgentAuth } from "@/lib/auth/agent-keys";
import { listEventsAfter } from "@/lib/services/events";
import { apiError, serviceErrorResponse } from "@/lib/api/http";
import { ServiceError } from "@/lib/services/agents";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) { const auth = await withAgentAuth(req, ["stream:read"]); if (!auth.ok) return auth.response; const url = new URL(req.url); const after = Number(url.searchParams.get("after") ?? 0); const limit = Number(url.searchParams.get("limit") ?? 100); if (!Number.isInteger(after) || after < 0 || !Number.isFinite(limit)) return apiError("invalid_request", "Invalid pagination"); try { return NextResponse.json(await listEventsAfter(auth.actorId, { after, limit, types: url.searchParams.get("types")?.split(",").filter(Boolean) })); } catch (e) { if (e instanceof ServiceError) return serviceErrorResponse(e); throw e; } }
