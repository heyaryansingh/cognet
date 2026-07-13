# Cognet full implementation handoff

## Goal

Implement the approved Cognet plan through Phases 1–6 using the supplied Design Brief, with responsive behavior below the prototype desktop layout.

## Contract

- Scope: complete product UI, social, marketplace, messaging/realtime, trust, payments, and platform/growth features in dependency order.
- Design source: `Cognet Design Brief/`; desktop fidelity at 1032px+, collapse rails and stack controls below it.
- Interfaces: retain `actors`, service-layer-only writes, agent-key choke point, shared profile serializer, API error envelope, RLS default deny, and timestamped migrations.
- Reuse: selectively port reviewed draft logic from `cognet-wt`; do not merge draft branches wholesale.
- External mode: local Supabase and Stripe test seams; no production credentials or deployment changes.
- Preserve: the user-owned untracked `Cognet Design Brief/` directory.

## Acceptance checks

- `npm ci`, `npm run lint`, `npm run build`, and local Supabase migration checks pass.
- Each phase has its compact check script plus the relevant API/UI flow tests.
- Desktop prototype routes match the Brief and responsive rails collapse below desktop.

## Dispatch log

- root: contract, design integration, integration, review, final verification.
- phase2: promote and complete social migration/services/routes/UI.
- phase3: promote and complete marketplace migration/services/routes/UI.
- messaging: promote and complete messaging/events/realtime migration/services/routes/UI.

## Evidence

- Initial main: `0cca286`; Phase 1 foundation only.
- Design Brief is untracked and available locally.
- Sibling phase branches are drafts/skeletons and require selective reconciliation.
- `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, and `git diff --check` pass after integration.
- Marketplace, messaging, payments, platform, and trust check scripts pass.
- `supabase db reset` applied migrations `20260713000001` through `20260713000007` in order.
- Local Supabase API/Auth was reset and started. `check-social.mjs` passes with local API/service credentials.
- Local Next app is live at `http://127.0.0.1:3001`; agent self-registration returned a show-once key and a follow-up profile GET returned the same handle.
- No Vercel token/project or production Supabase credentials are available in the current environment.

## Verdict

Local launch verified; production deployment is credential-gated.

## Current launch pass (2026-07-13)

- Goal: seed a curated set of source-attributed, unclaimed profiles for genuinely free/open agent projects, then publish and deploy.
- Frozen contract: no fabricated trust, uptime, transaction history, or verification. Profiles are `source=scraped`, unclaimed, and retain direct project/evidence links.
- Dispatch: GitHub scout returned Mini SWE-agent, Open Deep Research, and OpenHands; Hugging Face scout returned smolagents, HF Tiny Agents, and Open Computer Agent v2.0.
- Access evidence: GitHub CLI is authenticated as `heyaryansingh` with `repo` scope. Current callable connector surface has GitHub only; Supabase/Vercel MCP tools are absent. Local `.env.local` is available; Vercel CLI is available through `npx`.
- Verdict: profile importer, local seed, GitHub publish, and deployment verification are in progress.
