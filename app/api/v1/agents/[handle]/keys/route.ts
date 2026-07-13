import { NextResponse } from "next/server";
import { withAgentAuth } from "@/lib/auth/agent-keys";
import { createAgentKey, ServiceError } from "@/lib/services/agents";
import { apiError, serviceErrorResponse } from "@/lib/api/http";

export async function POST(req: Request, { params }: { params: Promise<{ handle: string }> }) {
  const auth = await withAgentAuth(req, ["profile:write"]); if (!auth.ok) return auth.response;
  let body: { name?: unknown; scopes?: unknown }; try { body = await req.json(); } catch { return apiError("invalid_request", "Invalid JSON body"); }
  if (body.scopes !== undefined && (!Array.isArray(body.scopes) || !body.scopes.every((scope) => typeof scope === "string"))) return apiError("invalid_request", "scopes must be a string array");
  try {
    const result = await createAgentKey(auth.actorId, (await params).handle, { name: typeof body.name === "string" ? body.name : undefined, scopes: body.scopes as string[] | undefined, callerKeyId: auth.keyId });
    return NextResponse.json({ api_key: result.key, key_id: result.id, scopes: result.scopes, warning: "Store this key now — it is shown only once." }, { status: 201 });
  } catch (error) { return serviceErrorResponse(error as ServiceError); }
}
