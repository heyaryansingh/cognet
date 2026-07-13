import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_AGENT_SCOPES, generateApiKey, isValidScope, type AgentScope } from "@/lib/auth/agent-keys";
import {
  serializeAgentProfile,
  type AgentProfile,
  type AgentProfileRow,
} from "@/lib/serializers/agent-profile";

// Service layer rule: every function takes the acting actorId first (null =
// unauthenticated/self-registration). Route handlers and server actions call
// these; they never touch the DB directly.

const HANDLE_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

export type RegisterAgentInput = {
  handle: string;
  displayName: string;
  tagline?: string;
  description?: string;
  version?: string;
  capabilities?: Record<string, unknown>;
  pricing?: Record<string, unknown>;
  endpoints?: Record<string, unknown>;
};

export class ServiceError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

// creatorActorId null = agent self-registration (unclaimed: gated until a
// human/org claims it).
export async function registerAgent(
  creatorActorId: string | null,
  input: RegisterAgentInput
): Promise<{ profile: AgentProfile; apiKey: string }> {
  const handle = input.handle.toLowerCase().trim();
  if (!HANDLE_RE.test(handle)) {
    throw new ServiceError(422, "Invalid handle (3-40 chars, a-z 0-9 -)");
  }
  if (!input.displayName?.trim()) {
    throw new ServiceError(422, "displayName required");
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("actors")
    .select("id")
    .eq("handle", handle)
    .maybeSingle();
  if (existing) throw new ServiceError(409, "Handle already taken");

  const { data: actor, error: actorErr } = await admin
    .from("actors")
    .insert({
      type: "agent",
      handle,
      display_name: input.displayName.trim(),
    })
    .select("id")
    .single();
  if (actorErr || !actor) {
    throw new ServiceError(500, `Failed to create actor: ${actorErr?.message}`);
  }

  const { error: agentErr } = await admin.from("agents").insert({
    actor_id: actor.id,
    creator_actor_id: creatorActorId,
    source: "registered",
    tagline: input.tagline ?? null,
    description: input.description ?? null,
  });
  if (agentErr) {
    await admin.from("actors").delete().eq("id", actor.id);
    throw new ServiceError(500, `Failed to create agent: ${agentErr.message}`);
  }

  const { data: version, error: verErr } = await admin
    .from("agent_versions")
    .insert({
      agent_actor_id: actor.id,
      version: input.version ?? "1.0.0",
      capabilities: input.capabilities ?? {},
      pricing: input.pricing ?? {},
      endpoints: input.endpoints ?? {},
    })
    .select("id")
    .single();
  if (verErr || !version) {
    await admin.from("actors").delete().eq("id", actor.id);
    throw new ServiceError(500, `Failed to create version: ${verErr?.message}`);
  }

  await admin
    .from("agents")
    .update({ current_version_id: version.id })
    .eq("actor_id", actor.id);

  const { key, prefix, hash } = generateApiKey();
  const { error: keyErr } = await admin.from("api_keys").insert({
    agent_actor_id: actor.id,
    key_prefix: prefix,
    key_hash: hash,
    scopes: DEFAULT_AGENT_SCOPES,
  });
  if (keyErr) {
    throw new ServiceError(500, `Failed to create key: ${keyErr.message}`);
  }

  const profile = await getAgentProfile(handle);
  if (!profile) throw new ServiceError(500, "Profile readback failed");
  return { profile, apiKey: key };
}

async function ownedAgent(actingActorId: string, handle: string) {
  const admin = createAdminClient();
  const { data: actor } = await admin.from("actors").select("id").eq("handle", handle.toLowerCase()).eq("type", "agent").maybeSingle();
  if (!actor) throw new ServiceError(404, "Agent not found");
  const { data: agent } = await admin.from("agents").select("actor_id,creator_actor_id").eq("actor_id", actor.id).maybeSingle();
  if (!agent || (actingActorId !== agent.actor_id && actingActorId !== agent.creator_actor_id)) throw new ServiceError(403, "Not your agent");
  return { admin, agent };
}

export async function createAgentKey(actingActorId: string, handle: string, input: { name?: string; scopes?: string[] }): Promise<{ id: string; key: string; scopes: AgentScope[] }> {
  const { admin, agent } = await ownedAgent(actingActorId, handle);
  const scopes = input.scopes?.length ? input.scopes : DEFAULT_AGENT_SCOPES;
  if (!scopes.every(isValidScope)) throw new ServiceError(422, "Invalid API key scope");
  const { key, prefix, hash } = generateApiKey();
  const { data, error } = await admin.from("api_keys").insert({ agent_actor_id: agent.actor_id, name: input.name?.trim().slice(0, 100) || "default", key_prefix: prefix, key_hash: hash, scopes }).select("id").single();
  if (error || !data) throw new ServiceError(500, error?.message ?? "Failed to create API key");
  return { id: data.id, key, scopes: scopes as AgentScope[] };
}

export async function rotateAgentKey(actingActorId: string, handle: string, keyId: string): Promise<{ id: string; key: string; scopes: AgentScope[]; oldKeyExpiresAt: string }> {
  const { admin, agent } = await ownedAgent(actingActorId, handle);
  const { data: oldKey } = await admin.from("api_keys").select("id,name,scopes,revoked_at").eq("id", keyId).eq("agent_actor_id", agent.actor_id).maybeSingle();
  if (!oldKey || oldKey.revoked_at) throw new ServiceError(404, "API key not found");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
  const { error } = await admin.from("api_keys").update({ expires_at: expiresAt }).eq("id", oldKey.id);
  if (error) throw new ServiceError(500, error.message);
  return { ...(await createAgentKey(actingActorId, handle, { name: oldKey.name, scopes: oldKey.scopes })), oldKeyExpiresAt: expiresAt };
}

export async function getAgentProfile(
  handle: string
): Promise<AgentProfile | null> {
  const admin = createAdminClient();

  const { data: actor } = await admin
    .from("actors")
    .select("id, handle, display_name, avatar_url, created_at")
    .eq("handle", handle.toLowerCase())
    .eq("type", "agent")
    .maybeSingle();
  if (!actor) return null;

  const { data: agent } = await admin
    .from("agents")
    .select(
      "tagline, description, trust_score, source, creator_actor_id, current_version_id"
    )
    .eq("actor_id", actor.id)
    .single();
  if (!agent) return null;

  let creator: { handle: string; display_name: string } | null = null;
  if (agent.creator_actor_id) {
    const { data } = await admin
      .from("actors")
      .select("handle, display_name")
      .eq("id", agent.creator_actor_id)
      .maybeSingle();
    creator = data ?? null;
  }

  const { data: versions } = await admin
    .from("agent_versions")
    .select(
      "id, version, changelog, capabilities, pricing, endpoints, self_reported_benchmarks, created_at"
    )
    .eq("agent_actor_id", actor.id)
    .order("created_at", { ascending: false });

  const row: AgentProfileRow = {
    actor,
    agent,
    creator,
    versions: versions ?? [],
  };
  return serializeAgentProfile(row);
}

export type UpdateAgentInput = {
  displayName?: string;
  tagline?: string;
  description?: string;
  avatarUrl?: string;
  capabilities?: Record<string, unknown>;
  pricing?: Record<string, unknown>;
  endpoints?: Record<string, unknown>;
};

// actingActorId must be the agent itself (via API key) or its creator.
export async function updateAgentProfile(
  actingActorId: string,
  handle: string,
  input: UpdateAgentInput
): Promise<AgentProfile> {
  const admin = createAdminClient();

  const { data: actor } = await admin
    .from("actors")
    .select("id")
    .eq("handle", handle.toLowerCase())
    .eq("type", "agent")
    .maybeSingle();
  if (!actor) throw new ServiceError(404, "Agent not found");

  const { data: agent } = await admin
    .from("agents")
    .select("creator_actor_id")
    .eq("actor_id", actor.id)
    .single();

  const allowed =
    actingActorId === actor.id || actingActorId === agent?.creator_actor_id;
  if (!allowed) throw new ServiceError(403, "Not your agent");

  if (input.displayName !== undefined || input.avatarUrl !== undefined) {
    const patch: Record<string, unknown> = {};
    if (input.displayName !== undefined) patch.display_name = input.displayName;
    if (input.avatarUrl !== undefined) patch.avatar_url = input.avatarUrl;
    const { error } = await admin.from("actors").update(patch).eq("id", actor.id);
    if (error) throw new ServiceError(500, error.message);
  }

  if (input.tagline !== undefined || input.description !== undefined) {
    const patch: Record<string, unknown> = {};
    if (input.tagline !== undefined) patch.tagline = input.tagline;
    if (input.description !== undefined) patch.description = input.description;
    const { error } = await admin
      .from("agents")
      .update(patch)
      .eq("actor_id", actor.id);
    if (error) throw new ServiceError(500, error.message);
  }

  if (
    input.capabilities !== undefined ||
    input.pricing !== undefined ||
    input.endpoints !== undefined
  ) {
    const { data: agentRow } = await admin
      .from("agents")
      .select("current_version_id")
      .eq("actor_id", actor.id)
      .single();
    if (!agentRow?.current_version_id) {
      throw new ServiceError(409, "Agent has no current version");
    }
    const patch: Record<string, unknown> = {};
    if (input.capabilities !== undefined) patch.capabilities = input.capabilities;
    if (input.pricing !== undefined) patch.pricing = input.pricing;
    if (input.endpoints !== undefined) patch.endpoints = input.endpoints;
    const { error } = await admin
      .from("agent_versions")
      .update(patch)
      .eq("id", agentRow.current_version_id);
    if (error) throw new ServiceError(500, error.message);
  }

  // registry event 'agent.updated' (director ruling): public, recipient NULL.
  // Feeds the Flight Plan matcher for capability/pricing steps.
  await admin.rpc("emit_event", {
    p_type: "agent.updated",
    p_actor_id: actor.id,
    p_payload: { handle: handle.toLowerCase(), fields: Object.keys(input) },
    p_recipient_actor_id: null,
  });

  const profile = await getAgentProfile(handle);
  if (!profile) throw new ServiceError(500, "Profile readback failed");
  return profile;
}

export type DirectoryFilters = {
  q?: string;
  minTrust?: number;
  // keyset cursor: [trust_score, actor_id] of last row from previous page
  cursor?: { trust: number | null; actorId: string };
  limit?: number;
};

export type DirectoryResult = {
  items: Array<{
    handle: string;
    displayName: string;
    avatarUrl: string | null;
    tagline: string | null;
    trustScore: number | null;
    claimed: boolean;
    actorId: string;
  }>;
  nextCursor: { trust: number | null; actorId: string } | null;
};

export async function searchAgents(
  filters: DirectoryFilters
): Promise<DirectoryResult> {
  const admin = createAdminClient();
  const limit = Math.min(filters.limit ?? 20, 50);

  let query = admin
    .from("agents")
    .select(
      "actor_id, tagline, trust_score, creator_actor_id, actors!agents_actor_id_fkey(handle, display_name, avatar_url)"
    )
    .order("trust_score", { ascending: false, nullsFirst: false })
    .order("actor_id", { ascending: true })
    .limit(limit + 1);

  if (filters.q?.trim()) {
    query = query.textSearch("search_tsv", filters.q.trim(), {
      type: "websearch",
      config: "english",
    });
  }
  if (filters.minTrust !== undefined) {
    query = query.gte("trust_score", filters.minTrust);
  }

  const { data, error } = await query;
  if (error) throw new ServiceError(500, error.message);

  type Row = {
    actor_id: string;
    tagline: string | null;
    trust_score: number | null;
    creator_actor_id: string | null;
    actors: {
      handle: string;
      display_name: string;
      avatar_url: string | null;
    };
  };
  let rows = (data ?? []) as unknown as Row[];

  // ponytail: cursor applied client-side within the fetched window; move to a
  // .or() keyset filter or RPC when directory outgrows a few hundred agents
  if (filters.cursor) {
    const { trust, actorId } = filters.cursor;
    rows = rows.filter((r) => {
      const t = r.trust_score;
      if (trust === null) return t === null && r.actor_id > actorId;
      if (t === null) return true;
      return t < trust || (t === trust && r.actor_id > actorId);
    });
  }

  const page = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  const last = page[page.length - 1];

  return {
    items: page.map((r) => ({
        actorId: r.actor_id,
        handle: r.actors.handle,
        displayName: r.actors.display_name,
        avatarUrl: r.actors.avatar_url,
        tagline: r.tagline,
        trustScore: r.trust_score,
        claimed: r.creator_actor_id !== null,
      })),
    nextCursor:
      hasMore && last
        ? { trust: last.trust_score, actorId: last.actor_id }
        : null,
  };
}
