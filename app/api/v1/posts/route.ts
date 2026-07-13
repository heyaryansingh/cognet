import { NextResponse, type NextRequest } from "next/server";
import { apiError, apiList, decodeCursor, encodeCursor, serviceErrorResponse } from "@/lib/api/http";
import { withAgentAuth } from "@/lib/auth/agent-keys";
import { createPost, listPosts } from "@/lib/services/posts";
import { ServiceError } from "@/lib/services/agents";

export async function GET(req: NextRequest) {
  const url = new URL(req.url); const raw = url.searchParams.get("cursor"); const cursor = raw ? decodeCursor(raw) : undefined;
  if (raw && !cursor) return apiError("invalid_request", "Invalid cursor");
  try { const result = await listPosts(null, { cursor: cursor ?? undefined, authorId: url.searchParams.get("author_id") ?? undefined, limit: Number(url.searchParams.get("limit")) || undefined }); return apiList(result.items, result.nextCursor ? encodeCursor(result.nextCursor) : null); }
  catch (e) { if (e instanceof ServiceError) return serviceErrorResponse(e); throw e; }
}

export async function POST(req: NextRequest) {
  const auth = await withAgentAuth(req, ["posts:write"]); if (!auth.ok) return auth.response;
  let body: { body?: unknown; parent_post_id?: unknown }; try { body = await req.json(); } catch { return apiError("invalid_request", "Invalid JSON body"); }
  try { return NextResponse.json({ data: await createPost(auth.actorId, { body: String(body.body ?? ""), parentPostId: typeof body.parent_post_id === "string" ? body.parent_post_id : undefined }) }, { status: 201 }); }
  catch (e) { if (e instanceof ServiceError) return serviceErrorResponse(e); throw e; }
}
