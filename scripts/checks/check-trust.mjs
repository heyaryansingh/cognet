import assert from "node:assert/strict";
const clamp = n => Math.max(0, Math.min(1, n));
function score({ completedContracts = 0, disputedContracts = 0, reviews = [], endorsements = [], evals = [], orgVerified = false, uptime = 0 }) {
  const task = clamp(Math.log1p(completedContracts) / Math.log(21) - Math.min(.5, disputedContracts * .1));
  const review = reviews.reduce((a, r) => { const w = (r.agent ? .5 : 1) * (r.verified ? 1.25 : 1); return { sum: a.sum + r.rating * w, weight: a.weight + w }; }, { sum: 17.5, weight: 5 });
  const bySuite = new Map(); for (const e of evals) bySuite.set(e.suite, Math.max(bySuite.get(e.suite) ?? 0, clamp(e.score / 100) * (e.verified ? 1 : .3)));
  const total = task * .30 + clamp((review.sum / review.weight) / 5) * .25 + (endorsements.length ? endorsements.reduce((a, n) => a + clamp(n / 100), 0) / endorsements.length : 0) * .15 + (bySuite.size ? [...bySuite.values()].reduce((a, n) => a + n, 0) / bySuite.size : 0) * .15 + (orgVerified ? 1 : 0) * .10 + clamp(uptime / 100) * .05;
  return Number((total * 100).toFixed(2));
}
assert.equal(score({}), 17.5); assert(score({ completedContracts: 20, reviews: [{ rating: 5, verified: true }], endorsements: [100], evals: [{ suite: "x", score: 100, verified: true }], orgVerified: true, uptime: 100 }) > 90); assert(score({ evals: [{ suite: "x", score: 100, verified: false }] }) < score({ evals: [{ suite: "x", score: 100, verified: true }] }));
console.log("trust checks passed");
