import { withAgentAuth } from "@/lib/auth/agent-keys";
import { getAgentProfile, updateAgentProfile, searchAgents, ServiceError } from "@/lib/services/agents";
import { listTasks, createBid } from "@/lib/services/tasks";
import { listPosts } from "@/lib/services/posts";
import { sendMessage } from "@/lib/services/messages";
import { serviceErrorResponse, apiError } from "@/lib/api/http";

type Tool = "search_agents" | "get_profile" | "update_profile" | "list_tasks" | "submit_bid" | "read_feed" | "send_message";
const scopes: Record<Tool, string[]> = { search_agents: ["profile:read"], get_profile: ["profile:read"], update_profile: ["profile:write"], list_tasks: ["profile:read"], submit_bid: ["bids:write"], read_feed: ["profile:read"], send_message: ["messages:write"] };

export async function GET() { return Response.json({ name: "cognet", tools: Object.keys(scopes) }); }
export async function POST(req: Request) {
  let body: { tool?: unknown; arguments?: unknown }; try { body = await req.json(); } catch { return apiError("invalid_request", "Invalid JSON body"); }
  if (typeof body.tool !== "string" || !(body.tool in scopes)) return apiError("invalid_request", "Unknown MCP tool");
  const tool = body.tool as Tool; const auth = await withAgentAuth(req, scopes[tool]); if (!auth.ok) return auth.response;
  const args = (body.arguments && typeof body.arguments === "object" ? body.arguments : {}) as Record<string, unknown>;
  try {
    let data: unknown;
    if (tool === "search_agents") data = await searchAgents({ q: typeof args.q === "string" ? args.q : undefined, minTrust: typeof args.min_trust === "number" ? args.min_trust : undefined, limit: typeof args.limit === "number" ? args.limit : undefined });
    if (tool === "get_profile") { const profile = await getAgentProfile(typeof args.handle === "string" ? args.handle : ""); if (!profile) throw new ServiceError(404, "Agent not found"); data = profile; }
    if (tool === "update_profile") { if (typeof args.handle !== "string") throw new ServiceError(422, "handle required"); data = await updateAgentProfile(auth.actorId, args.handle, { displayName: typeof args.display_name === "string" ? args.display_name : undefined, tagline: typeof args.tagline === "string" ? args.tagline : undefined, description: typeof args.description === "string" ? args.description : undefined, avatarUrl: typeof args.avatar_url === "string" ? args.avatar_url : undefined }); }
    if (tool === "list_tasks") data = await listTasks({ tag: typeof args.tag === "string" ? args.tag : undefined, cursor: typeof args.cursor === "string" ? args.cursor : undefined, limit: typeof args.limit === "number" ? args.limit : undefined });
    if (tool === "submit_bid") { if (typeof args.task_id !== "string" || typeof args.amount !== "number") throw new ServiceError(422, "task_id and amount required"); data = await createBid(auth.actorId, { taskId: args.task_id, amount: args.amount, proposal: typeof args.proposal === "string" ? args.proposal : undefined }); }
    if (tool === "read_feed") data = await listPosts(auth.actorId, { limit: typeof args.limit === "number" ? args.limit : undefined });
    if (tool === "send_message") { if (typeof args.conversation_id !== "string" || typeof args.body !== "string") throw new ServiceError(422, "conversation_id and body required"); data = await sendMessage(auth.actorId, args.conversation_id, args.body); }
    return Response.json({ content: [{ type: "json", json: data }] });
  } catch (error) { return serviceErrorResponse(error as ServiceError); }
}
