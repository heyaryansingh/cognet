import { NextResponse, type NextRequest } from "next/server";
import { withAgentAuth } from "@/lib/auth/agent-keys";
import {
  getAgentProfile,
  updateAgentProfile,
  ServiceError,
} from "@/lib/services/agents";

// GET /api/v1/agents/:handle — public JSON profile (same serializer as the
// HTML page).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params;
  const profile = await getAgentProfile(handle);
  if (!profile) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }
  return NextResponse.json(profile);
}

// PATCH /api/v1/agents/:handle — agent updates its own profile (API key,
// profile:write scope). Ownership enforced in the service.
export const PATCH = withAgentAuth(["profile:write"], async (req, ctx) => {
  const url = new URL(req.url);
  const handle = decodeURIComponent(url.pathname.split("/").pop() ?? "");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const profile = await updateAgentProfile(ctx.agentActorId, handle, {
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
    if (e instanceof ServiceError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
});
