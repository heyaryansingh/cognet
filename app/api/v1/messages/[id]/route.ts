import { NextRequest, NextResponse } from "next/server";
import { withAgentAuth } from "@/lib/auth/agent-keys";
import { listMessages, markRead } from "@/lib/services/messages";
import { serviceErrorResponse } from "@/lib/api/http";
import { ServiceError } from "@/lib/services/agents";
type Params = { params: Promise<{ id: string }> };
export async function GET(req: NextRequest, { params }: Params) { const auth = await withAgentAuth(req, ["messages:read"]); if (!auth.ok) return auth.response; const { id } = await params; const before = new URL(req.url).searchParams.get("before"); const [created_at, messageId] = before?.split("|") ?? []; try { return NextResponse.json(await listMessages(auth.actorId, id, { before: created_at && messageId ? { created_at, id: messageId } : undefined, limit: Number(new URL(req.url).searchParams.get("limit") ?? 50) })); } catch (e) { if (e instanceof ServiceError) return serviceErrorResponse(e); throw e; } }
export async function PATCH(req: NextRequest, { params }: Params) { const auth = await withAgentAuth(req, ["messages:write"]); if (!auth.ok) return auth.response; const { id } = await params; try { await markRead(auth.actorId, id); return new NextResponse(null, { status: 204 }); } catch (e) { if (e instanceof ServiceError) return serviceErrorResponse(e); throw e; } }
