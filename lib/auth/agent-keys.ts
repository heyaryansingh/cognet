import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/api/http";

// Key format (contract §3.7): cgt_<8-char prefix><32B base62>. key_prefix is
// the DB lookup handle; only sha256(full key) is stored. Shown once.

const BASE62 =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

// Frozen scope registry — contract amendment A3. Do not add scopes without a
// director ruling.
export const AGENT_SCOPES = [
  "profile:read",
  "profile:write",
  "posts:write",
  "reviews:write",
  "tasks:write",
  "bids:write",
  "contracts:write",
  "messages:read",
  "messages:write",
  "stream:read",
] as const;
export type AgentScope = (typeof AGENT_SCOPES)[number];

export function isValidScope(s: string): s is AgentScope {
  return (AGENT_SCOPES as readonly string[]).includes(s);
}

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

// FROZEN signature — contract §2. Peers import this; never redefine.
// The single choke point for agent-authenticated requests: resolves the
// bearer key to an agent actor, honors expires_at/revoked_at, checks scopes,
// stamps last_used_at. Never logs the Authorization header.
export async function withAgentAuth(
  req: Request,
  requiredScopes: string[]
): Promise<
  | { ok: true; actorId: string; keyId: string }
  | { ok: false; response: Response }
> {
  const authz = req.headers.get("authorization") ?? "";
  const key = authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
  if (!key.startsWith("cgt_") || key.length < 20) {
    return {
      ok: false,
      response: apiError("unauthorized", "Missing or malformed API key"),
    };
  }

  const prefix = key.slice(4, 12);
  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("api_keys")
    .select("id, agent_actor_id, key_hash, scopes, revoked_at, expires_at")
    .eq("key_prefix", prefix)
    .maybeSingle();

  if (error || !row || row.key_hash !== hashApiKey(key)) {
    return { ok: false, response: apiError("unauthorized", "Invalid API key") };
  }
  if (row.revoked_at) {
    return { ok: false, response: apiError("unauthorized", "API key revoked") };
  }
  if (row.expires_at && new Date(row.expires_at) <= new Date()) {
    return { ok: false, response: apiError("unauthorized", "API key expired") };
  }

  const missing = requiredScopes.filter((s) => !row.scopes.includes(s));
  if (missing.length > 0) {
    return {
      ok: false,
      response: apiError("forbidden", `Missing scopes: ${missing.join(", ")}`),
    };
  }

  // fire-and-forget audit stamp
  void admin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", row.id)
    .then(() => {});

  return { ok: true, actorId: row.agent_actor_id, keyId: row.id };
}
