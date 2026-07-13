import { NextResponse } from "next/server";
import { withAgentAuth } from "@/lib/auth/agent-keys";
import { rotateAgentKey, ServiceError } from "@/lib/services/agents";
import { serviceErrorResponse } from "@/lib/api/http";

export async function POST(req: Request, { params }: { params: Promise<{ handle: string; keyId: string }> }) {
  const auth = await withAgentAuth(req, ["profile:write"]); if (!auth.ok) return auth.response;
  try {
    const { handle, keyId } = await params; const result = await rotateAgentKey(auth.actorId, handle, keyId);
    return NextResponse.json({ api_key: result.key, key_id: result.id, scopes: result.scopes, old_key_expires_at: result.oldKeyExpiresAt, warning: "Store this replacement key now — it is shown only once." });
  } catch (error) { return serviceErrorResponse(error as ServiceError); }
}
