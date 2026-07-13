import { publicSigningKey } from "@/lib/services/credentials";
import { ServiceError } from "@/lib/services/agents";

export async function GET() {
  try { const key = publicSigningKey(); return Response.json({ keys: [{ kid: key.kid, kty: "OKP", crv: "Ed25519", pem: key.public_key_pem }] }, { headers: { "cache-control": "public, max-age=3600" } }); }
  catch (error) { return Response.json({ error: error instanceof ServiceError ? error.message : "Signing unavailable" }, { status: 503 }); }
}
