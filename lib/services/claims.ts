import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashSecret } from "@/lib/services/credentials";
import { ServiceError } from "@/lib/services/agents";

const token = () => randomBytes(24).toString("base64url");
const HANDLE = /^[a-z0-9][a-z0-9-]{1,38}$/;
const publicUrl = (raw: string) => {
  let url: URL; try { url = new URL(raw); } catch { throw new ServiceError(422, "Invalid source URL"); }
  const host = url.hostname.toLowerCase();
  // SSRF: require https on the default port to a DNS hostname — IP literals
  // (v4 and bracketed v6) are rejected outright, which also covers loopback,
  // RFC1918, link-local/cloud-metadata (169.254.169.254) and 0.0.0.0 forms.
  // ponytail: DNS-rebinding (hostname -> private IP) needs resolve-then-pin;
  // add if the ingestor ever fetches attacker-chosen hosts beyond registries.
  const isIpLiteral = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[") || /^[0-9a-f:]+$/.test(host) && host.includes(":");
  if (
    url.protocol !== "https:" ||
    url.port !== "" ||
    isIpLiteral ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    !host.includes(".")
  ) throw new ServiceError(422, "Source URL must be public https");
  return url;
};
const handleOf = (value: string) => value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

export async function ingestClaimableAgent(input: { handle: string; displayName: string; description?: string; avatarUrl?: string; sourceUrl: string; capabilities?: Record<string, unknown> }) {
  const handle = handleOf(input.handle); if (!HANDLE.test(handle) || !input.displayName.trim() || input.displayName.length > 200) throw new ServiceError(422, "Invalid claimable agent profile");
  const sourceUrl = publicUrl(input.sourceUrl); const db = createAdminClient();
  const { data: existing } = await db.from("actors").select("id").eq("handle", handle).maybeSingle();
  if (existing) return { handle, created: false };
  const { data: actor, error: actorError } = await db.from("actors").insert({ type: "agent", handle, display_name: input.displayName.trim(), avatar_url: input.avatarUrl ?? null }).select("id").single();
  if (actorError || !actor) throw new ServiceError(500, actorError?.message ?? "Could not create actor");
  const { error: agentError } = await db.from("agents").insert({ actor_id: actor.id, source: "scraped", tagline: `Claimed from ${sourceUrl.hostname}`, description: input.description?.slice(0, 5000) ?? null });
  if (agentError) throw new ServiceError(500, agentError.message);
  const { data: version, error: versionError } = await db.from("agent_versions").insert({ agent_actor_id: actor.id, version: "imported", capabilities: { ...(input.capabilities ?? {}), source_url: sourceUrl.toString() } }).select("id").single();
  if (versionError || !version) throw new ServiceError(500, versionError?.message ?? "Could not create version");
  await db.from("agents").update({ current_version_id: version.id }).eq("actor_id", actor.id);
  return { handle, created: true };
}

async function jsonFrom(url: URL) { const response = await fetch(url, { headers: { accept: "application/json", "user-agent": "Cognet-claim-ingestor/1" }, signal: AbortSignal.timeout(10_000) }); if (!response.ok) throw new ServiceError(422, `Source returned HTTP ${response.status}`); return response.json() as Promise<Record<string, unknown>>; }

export async function ingestGitHubProfile(rawUrl: string) {
  const url = publicUrl(rawUrl); const parts = url.pathname.split("/").filter(Boolean);
  if (url.hostname !== "github.com" || parts.length !== 1) throw new ServiceError(422, "GitHub profile URL required");
  const user = await jsonFrom(new URL(`https://api.github.com/users/${encodeURIComponent(parts[0])}`));
  return ingestClaimableAgent({ handle: String(user.login ?? parts[0]), displayName: String(user.name ?? user.login ?? parts[0]), description: typeof user.bio === "string" ? user.bio : undefined, avatarUrl: typeof user.avatar_url === "string" ? user.avatar_url : undefined, sourceUrl: url.toString(), capabilities: { github: parts[0] } });
}

export async function ingestMcpRegistryProfile(rawUrl: string) {
  const url = publicUrl(rawUrl); const item = await jsonFrom(url); const name = typeof item.name === "string" ? item.name : typeof item.handle === "string" ? item.handle : "";
  return ingestClaimableAgent({ handle: name, displayName: typeof item.display_name === "string" ? item.display_name : name, description: typeof item.description === "string" ? item.description : undefined, sourceUrl: url.toString(), capabilities: { mcp_registry: true } });
}

export async function createClaimToken(actingActorId: string, agentActorId: string) {
  const db = createAdminClient();
  const { data: agent } = await db.from("agents").select("creator_actor_id").eq("actor_id", agentActorId).maybeSingle();
  if (!agent) throw new ServiceError(404, "Agent not found");
  if (agent.creator_actor_id) throw new ServiceError(409, "Agent is already claimed");
  // A self-registered agent can request a token; possession is verified by an out-of-band proof.
  if (actingActorId !== agentActorId) throw new ServiceError(403, "Not your agent");
  const value = token();
  const { error } = await db.from("claim_tokens").insert({ agent_actor_id: agentActorId, token_hash: hashSecret(value), expires_at: new Date(Date.now() + 24 * 3600_000).toISOString() });
  if (error) throw new ServiceError(500, error.message);
  return { token: value, expiresAt: new Date(Date.now() + 24 * 3600_000).toISOString() };
}

async function unclaimedScrapedAgent(handle: string) {
  const db = createAdminClient();
  const { data: actor } = await db.from("actors").select("id").eq("handle", handle.toLowerCase()).eq("type", "agent").maybeSingle();
  if (!actor) throw new ServiceError(404, "Agent not found");
  const { data: agent } = await db.from("agents").select("actor_id,creator_actor_id,source,current_version_id").eq("actor_id", actor.id).maybeSingle();
  if (!agent || agent.source !== "scraped" || agent.creator_actor_id) throw new ServiceError(409, "Agent is not an unclaimed scraped profile");
  return { db, agent };
}

export async function startNamedClaim(handle: string) {
  const { db, agent } = await unclaimedScrapedAgent(handle);
  const value = token(); const expiresAt = new Date(Date.now() + 24 * 3600_000).toISOString();
  const { error } = await db.from("claim_tokens").insert({ agent_actor_id: agent.actor_id, token_hash: hashSecret(value), expires_at: expiresAt });
  if (error) throw new ServiceError(500, error.message);
  return { proof: value, expiresAt };
}

export async function claimNamedScrapedAgent(actingActorId: string, handle: string, proof: string) {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(proof)) throw new ServiceError(422, "Invalid claim proof");
  const { db, agent } = await unclaimedScrapedAgent(handle);
  const { data: claim } = await db.from("claim_tokens").select("id,expires_at,claimed_at").eq("agent_actor_id", agent.actor_id).eq("token_hash", hashSecret(proof)).maybeSingle();
  if (!claim || claim.claimed_at || new Date(claim.expires_at) <= new Date()) throw new ServiceError(404, "Claim proof not found or expired");
  const { data: version } = await db.from("agent_versions").select("capabilities").eq("id", agent.current_version_id).maybeSingle();
  const sourceUrl = (version?.capabilities as Record<string, unknown> | null)?.source_url;
  if (typeof sourceUrl !== "string") throw new ServiceError(422, "Claim source unavailable");
  const source = publicUrl(sourceUrl);
  let proven = false;
  try {
    if (source.hostname === "github.com") {
      const user = await jsonFrom(new URL(`https://api.github.com/users/${encodeURIComponent(source.pathname.split("/").filter(Boolean)[0] ?? "")}`));
      proven = typeof user.bio === "string" && user.bio.includes(`cognet-claim:${proof}`);
    } else {
      const profile = await jsonFrom(source);
      proven = profile.cognet_claim_token === proof;
    }
  } catch { proven = false; }
  if (!proven) throw new ServiceError(422, "Publish cognet-claim:<proof> at the source before claiming");
  // compare-and-set: losing the race must NOT return success or burn the token
  const { data: won, error } = await db.from("agents").update({ creator_actor_id: actingActorId }).eq("actor_id", agent.actor_id).is("creator_actor_id", null).select("actor_id");
  if (error) throw new ServiceError(500, error.message);
  if (!won || won.length === 0) throw new ServiceError(409, "Agent was claimed by someone else first");
  await db.from("claim_tokens").update({ claimed_at: new Date().toISOString(), claimed_by_actor_id: actingActorId }).eq("id", claim.id);
  return { agentActorId: agent.actor_id };
}

export async function claimAgent(actingActorId: string, value: string) {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(value)) throw new ServiceError(422, "Invalid claim token");
  const db = createAdminClient();
  const { data: row } = await db.from("claim_tokens").select("id,agent_actor_id,expires_at,claimed_at").eq("token_hash", hashSecret(value)).maybeSingle();
  if (!row || row.claimed_at || new Date(row.expires_at) <= new Date()) throw new ServiceError(404, "Claim token not found or expired");
  const { data: agent } = await db.from("agents").select("creator_actor_id").eq("actor_id", row.agent_actor_id).maybeSingle();
  if (!agent || agent.creator_actor_id) throw new ServiceError(409, "Agent is already claimed");
  // compare-and-set: losing the race must NOT return success or burn the token
  const { data: won, error } = await db.from("agents").update({ creator_actor_id: actingActorId }).eq("actor_id", row.agent_actor_id).is("creator_actor_id", null).select("actor_id");
  if (error) throw new ServiceError(500, error.message);
  if (!won || won.length === 0) throw new ServiceError(409, "Agent was claimed by someone else first");
  await db.from("claim_tokens").update({ claimed_at: new Date().toISOString(), claimed_by_actor_id: actingActorId }).eq("id", row.id);
  return { agentActorId: row.agent_actor_id };
}
