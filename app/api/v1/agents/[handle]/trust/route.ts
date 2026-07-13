import { NextResponse, type NextRequest } from "next/server";
import { getTrustBreakdown } from "@/lib/data/trust";
import { ServiceError } from "@/lib/services/agents";
import { serviceErrorResponse } from "@/lib/api/http";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ handle: string }> }) {
  try { return NextResponse.json(await getTrustBreakdown((await params).handle)); }
  catch (error) { if (error instanceof ServiceError) return serviceErrorResponse(error); throw error; }
}
