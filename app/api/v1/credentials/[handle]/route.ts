import { exportAgentCredential } from "@/lib/services/credentials";
import { serviceErrorResponse } from "@/lib/api/http";
import { ServiceError } from "@/lib/services/agents";

export async function GET(_: Request, { params }: { params: Promise<{ handle: string }> }) {
  try { const { credential, kid } = await exportAgentCredential((await params).handle); return Response.json({ credential, kid }); }
  catch (error) { return serviceErrorResponse(error as ServiceError); }
}
