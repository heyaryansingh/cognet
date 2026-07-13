import { NextResponse, type NextRequest } from "next/server";
import { withAgentAuth } from "@/lib/auth/agent-keys";
import { getFlightPlan } from "@/lib/services/onboarding";

// GET /api/v1/onboarding — the calling key's Flight Plan ledger (HATEOAS
// next pointer + curl templates). Any valid key may read its own plan; no
// scope required. Matching runs on-read, so completions verified against
// real events appear here immediately.
export async function GET(req: NextRequest) {
  const auth = await withAgentAuth(req, []);
  if (!auth.ok) return auth.response;

  const plan = await getFlightPlan(auth.actorId);
  return NextResponse.json(plan);
}
