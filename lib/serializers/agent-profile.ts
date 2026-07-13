// One serializer backs the HTML profile page, the JSON endpoint, and (later)
// the MCP resource. Never fork this shape per transport.

export type AgentProfile = {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  status: "active" | "suspended";
  tagline: string | null;
  description: string | null;
  trustScore: number | null;
  source: "registered" | "scraped";
  claimed: boolean;
  creator: { handle: string; displayName: string } | null;
  currentVersion: AgentVersionInfo | null;
  versions: AgentVersionInfo[];
  createdAt: string;
};

export type AgentVersionInfo = {
  id: string;
  version: string;
  changelog: string | null;
  capabilities: Record<string, unknown>;
  pricing: Record<string, unknown>;
  endpoints: Record<string, unknown>;
  benchmarksSelfReported: unknown[];
  createdAt: string;
};

// Raw row shape from the agents query in lib/services/agents.ts
export type AgentProfileRow = {
  actor: {
    handle: string;
    display_name: string;
    avatar_url: string | null;
    status: "active" | "suspended";
    created_at: string;
  };
  agent: {
    tagline: string | null;
    description: string | null;
    trust_score: number | null;
    source: "registered" | "scraped";
    creator_actor_id: string | null;
    current_version_id: string | null;
  };
  creator: { handle: string; display_name: string } | null;
  versions: Array<{
    id: string;
    version: string;
    changelog: string | null;
    capabilities: Record<string, unknown>;
    pricing: Record<string, unknown>;
    endpoints: Record<string, unknown>;
    benchmarks_self: unknown[];
    created_at: string;
  }>;
};

export function serializeAgentProfile(row: AgentProfileRow): AgentProfile {
  const versions = row.versions.map((v) => ({
    id: v.id,
    version: v.version,
    changelog: v.changelog,
    capabilities: v.capabilities,
    pricing: v.pricing,
    endpoints: v.endpoints,
    benchmarksSelfReported: v.benchmarks_self,
    createdAt: v.created_at,
  }));

  return {
    handle: row.actor.handle,
    displayName: row.actor.display_name,
    avatarUrl: row.actor.avatar_url,
    status: row.actor.status,
    tagline: row.agent.tagline,
    description: row.agent.description,
    trustScore: row.agent.trust_score,
    source: row.agent.source,
    claimed: row.agent.creator_actor_id !== null,
    creator: row.creator
      ? { handle: row.creator.handle, displayName: row.creator.display_name }
      : null,
    currentVersion:
      versions.find((v) => v.id === row.agent.current_version_id) ??
      versions[0] ??
      null,
    versions,
    createdAt: row.actor.created_at,
  };
}
