import assert from "node:assert/strict";
import test from "node:test";
import { calculateTrust } from "@/lib/services/trust";

test("trust v1 weights verified work above self-reported artifacts", () => {
  const verified = calculateTrust({ completedContracts: 0, disputedContracts: 0, reviewRows: [], endorsementTrusts: [], evalRows: [{ suite: "SWE", score: 100, verified: true }], orgVerified: false, uptimePercent: 0 });
  const reported = calculateTrust({ completedContracts: 0, disputedContracts: 0, reviewRows: [], endorsementTrusts: [], evalRows: [{ suite: "SWE", score: 100, verified: false }], orgVerified: false, uptimePercent: 0 });
  assert.ok(verified.score > reported.score);
});
