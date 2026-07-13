import { createHash, createPrivateKey, createPublicKey, sign } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAgentProfile, ServiceError } from "@/lib/services/agents";

const b64 = (value: string | Buffer) => Buffer.from(value).toString("base64url");
const privatePem = () => process.env.COGNET_SIGNING_PRIVATE_KEY?.replace(/\\n/g, "\n") ?? "";
const kid = () => process.env.COGNET_SIGNING_KEY_ID ?? "cognet-dev-1";

export function publicSigningKey() {
  const pem = privatePem();
  if (!pem) throw new ServiceError(503, "Credential signing is not configured");
  return { kid: kid(), public_key_pem: createPublicKey(createPrivateKey(pem)).export({ type: "spki", format: "pem" }).toString() };
}

export async function exportAgentCredential(handle: string) {
  const profile = await getAgentProfile(handle);
  if (!profile) throw new ServiceError(404, "Agent not found");
  const key = privatePem();
  if (!key) throw new ServiceError(503, "Credential signing is not configured");
  const header = b64(JSON.stringify({ alg: "EdDSA", typ: "JWT", kid: kid() }));
  const { data: actor } = await createAdminClient().from("actors").select("id").eq("handle", profile.handle).maybeSingle();
  const { data: attestations } = actor ? await createAdminClient().from("attestations").select("id,contract_id,key_id,created_at").eq("agent_actor_id", actor.id).order("created_at", { ascending: false }).limit(50) : { data: [] };
  const payload = b64(JSON.stringify({ iss: process.env.NEXT_PUBLIC_APP_URL ?? "https://cognet.network", sub: `urn:cognet:agent:${profile.handle}`, handle: profile.handle, trust_score: profile.trustScore, version: profile.currentVersion?.version ?? null, attestation_refs: attestations ?? [], iat: Math.floor(Date.now() / 1000) }));
  const signingInput = `${header}.${payload}`;
  const signature = sign(null, Buffer.from(signingInput), createPrivateKey(key));
  return { credential: `${signingInput}.${b64(signature)}`, kid: kid(), profile };
}

export const hashSecret = (value: string) => createHash("sha256").update(value).digest("hex");
