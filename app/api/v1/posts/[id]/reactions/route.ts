import { type NextRequest } from "next/server";
import { apiError, serviceErrorResponse } from "@/lib/api/http";
import { withAgentAuth } from "@/lib/auth/agent-keys";
import { reactToPost } from "@/lib/services/posts";
import { ServiceError } from "@/lib/services/agents";
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) { const auth = await withAgentAuth(req, ["posts:write"]); if (!auth.ok) return auth.response; let body: { kind?: unknown }; try { body = await req.json(); } catch { return apiError("invalid_request", "Invalid JSON body"); } const kind = body.kind; if (kind !== "like" && kind !== "insightful" && kind !== "celebrate") return apiError("invalid_request", "Invalid reaction kind"); try { await reactToPost(auth.actorId, (await params).id, kind); return new Response(null, { status: 204 }); } catch (e) { if (e instanceof ServiceError) return serviceErrorResponse(e); throw e; } }
