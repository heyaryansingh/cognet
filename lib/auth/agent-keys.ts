import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Key format: cgt_<prefix(8)><secret(32 chars base62)>. Prefix is the DB
// lookup handle; only sha256(full key) is stored. Shown once at creation.

const BASE62 =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export const AGENT_SCOPES = [
  "profile:read",
  "profile:write",
  "posts:write",
  "bids:write",
  "messages:write",
] as const;
export type AgentScope = (typeof AGENT_SCOPES)[number];

function base62(bytes: Buffer): string {
  let out = "";
  for (const b of bytes) out += BASE62[b % 62];
  return out;
}

export function generateApiKey(): {
  key: string;
  prefix: string;
  hash: string;
} {
  const prefix = base62(randomBytes(8));
  const secret = base62(randomBytes(32));
  const key = `cgt_${prefix}${secret}`;
  return { key, prefix, hash: hashApiKey(key) };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export type AgentAuthContext = {
  agentActorId: string;
  keyId: string;
  scopes: string[];
};

export class AgentAuthError extends Error {
  constructor(
    public status: 401 | 403,
    message: string
  ) {
    super(message);
  }
}

// The single choke point for agent-authenticated requests. Resolves the
// bearer key to an agent actor, checks scopes, updates last_used_at.
// Callers get a service-role path; every service function still takes the
// acting actorId explicitly.
export async function authenticateAgent(
  req: NextRequest,
  requiredScopes: AgentScope[]
): Promise<AgentAuthContext> {
  const authz = req.headers.get("authorization") ?? "";
  const key = authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
  if (!key.startsWith("cgt_") || key.length < 20) {
    throw new AgentAuthError(401, "Missing or malformed API key");
  }

  const prefix = key.slice(4, 12);
  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("api_keys")
    .select("id, agent_actor_id, key_hash, scopes, revoked_at, grace_expires_at")
    .eq("prefix", prefix)
    .maybeSingle();

  if (error || !row || row.key_hash !== hashApiKey(key)) {
    throw new AgentAuthError(401, "Invalid API key");
  }
  if (row.revoked_at) {
    const grace = row.grace_expires_at && new Date(row.grace_expires_at) > new Date();
    if (!grace) throw new AgentAuthError(401, "API key revoked");
  }

  const missing = requiredScopes.filter((s) => !row.scopes.includes(s));
  if (missing.length > 0) {
    throw new AgentAuthError(403, `Missing scopes: ${missing.join(", ")}`);
  }

  // fire-and-forget audit stamp
  void admin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", row.id)
    .then(() => {});

  return { agentActorId: row.agent_actor_id, keyId: row.id, scopes: row.scopes };
}

// Route-handler wrapper: 401/403 on auth failure, otherwise runs the handler
// with the resolved agent context.
export function withAgentAuth(
  requiredScopes: AgentScope[],
  handler: (req: NextRequest, ctx: AgentAuthContext) => Promise<Response>
) {
  return async (req: NextRequest): Promise<Response> => {
    try {
      const ctx = await authenticateAgent(req, requiredScopes);
      return await handler(req, ctx);
    } catch (e) {
      if (e instanceof AgentAuthError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }
  };
}
