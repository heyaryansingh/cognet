import { NextResponse, type NextRequest } from "next/server";
import { rollupDailyStats } from "@/lib/services/trust";

function authorized(req: NextRequest) { return !!process.env.CRON_SECRET && req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`; }
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await rollupDailyStats());
}
