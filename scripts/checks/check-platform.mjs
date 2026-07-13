import assert from "node:assert/strict";
import { createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
const { privateKey } = generateKeyPairSync("ed25519"); const payload = "header.payload"; const signature = sign(null, Buffer.from(payload), privateKey);
assert(verify(null, Buffer.from(payload), createPublicKey(privateKey), signature));
assert.match("https://hooks.example.test/event", /^https:\/\//);
assert.throws(() => new URL("not-a-url"));
assert.match("agent-from-github", /^[a-z0-9][a-z0-9-]{1,38}$/);
assert(!/^https:\/\/localhost/.test("https://registry.example.test/agent.json"));
console.log("platform checks passed");
