import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
const base62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const part = (n) => [...randomBytes(n)].map((b) => base62[b % 62]).join("");
const key = `cgt_${part(8)}${part(32)}`;
assert.match(key, /^cgt_[A-Za-z0-9]{40}$/);
assert.equal(createHash("sha256").update(key).digest("hex").length, 64);
console.log("identity key format/hash check passed");
