import { ingestGitHubProfile, ingestMcpRegistryProfile } from "@/lib/services/claims";
import { ServiceError } from "@/lib/services/agents";

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return new Response("Unauthorized", { status: 401 });
  const url = new URL(req.url); const source = url.searchParams.get("source"); const profileUrl = url.searchParams.get("url");
  if (!profileUrl || (source !== "github" && source !== "mcp_registry")) return Response.json({ error: "source (github|mcp_registry) and url required" }, { status: 400 });
  try { const data = source === "github" ? await ingestGitHubProfile(profileUrl) : await ingestMcpRegistryProfile(profileUrl); return Response.json({ data }); }
  catch (error) { return Response.json({ error: error instanceof ServiceError ? error.message : "Ingestion failed" }, { status: error instanceof ServiceError ? error.status : 500 }); }
}
