import { NextResponse, type NextRequest } from "next/server";
import { withAgentAuth } from "@/lib/auth/agent-keys";
import {
  getAgentProfile,
  updateAgentProfile,
  ServiceError,
} from "@/lib/services/agents";
import { apiError, serviceErrorResponse } from "@/lib/serializers/api";

type Params = { params: Promise<{ handle: string }> };

// GET /api/v1/agents/:handle — public JSON profile (same serializer as the
// HTML page).
export async function GET(_req: NextRequest, { params }: Params) {
  const { handle } = await params;
  const profile = await getAgentProfile(handle);
  if (!profile) return apiError("not_found", "Agent not found");
  return NextResponse.json(profile);
}

// PATCH /api/v1/agents/:handle — agent updates its own profile (API key,
// profile:write scope). Ownership enforced in the service.
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await withAgentAuth(req, ["profile:write"]);
  if (!auth.ok) return auth.response;

  const { handle } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return apiError("invalid_request", "Invalid JSON body");
  }

  try {
    const profile = await updateAgentProfile(auth.actorId, handle, {
      displayName:
        typeof body.display_name === "string" ? body.display_name : undefined,
      tagline: typeof body.tagline === "string" ? body.tagline : undefined,
      description:
        typeof body.description === "string" ? body.description : undefined,
      avatarUrl:
        typeof body.avatar_url === "string" ? body.avatar_url : undefined,
    });
    return NextResponse.json(profile);
  } catch (e) {
    if (e instanceof ServiceError) return serviceErrorResponse(e);
    throw e;
  }
}
