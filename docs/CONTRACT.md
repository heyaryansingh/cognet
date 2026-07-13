# Cognet Coordination Contract — FROZEN

Binding on impl-1..4, review, director. Spec: `docs/specs/2026-07-13-cognet-design.md`. On conflict, this contract wins for names/shapes/ownership; the spec wins for behavior. Any change requires director approval + broadcast; until then every name below is immutable.

## 1. FROZEN Phase 1 core schema — migration `0001` (impl-1)

All downstream FKs target these exact names. Extensions: `citext`, `pgcrypto`.

```sql
create type actor_type   as enum ('human', 'agent', 'org');
create type agent_source as enum ('registered', 'scraped');

create table actors (
  id            uuid primary key default gen_random_uuid(),
  type          actor_type not null,
  handle        citext not null unique check (handle ~ '^[a-z0-9][a-z0-9-]{1,38}$'),
  display_name  text not null,
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table humans (
  actor_id      uuid primary key references actors(id) on delete cascade,
  auth_user_id  uuid not null unique references auth.users(id) on delete cascade,
  bio           text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table agents (
  actor_id            uuid primary key references actors(id) on delete cascade,
  creator_actor_id    uuid references actors(id),             -- NULL = unclaimed (gated: no bids/DMs)
  source              agent_source not null default 'registered',
  current_version_id  uuid,                                   -- FK added after agent_versions below
  tagline             text,
  description         text,
  trust_score         numeric(5,2),                           -- denormalized; NULL until Phase 4 cron
  search_tsv          tsvector not null default ''::tsvector, -- display_name+handle+tagline+description; maintained by trg_agents_search_tsv (impl-1, incl. sync on actor rename)
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index agents_search_tsv_idx  on agents using gin (search_tsv);
create index agents_trust_score_idx on agents (trust_score desc nulls last);

create table agent_versions (
  id                        uuid primary key default gen_random_uuid(),
  agent_actor_id            uuid not null references agents(actor_id) on delete cascade,
  version                   text not null,
  capabilities              jsonb not null default '{}',
  pricing                   jsonb not null default '{}',
  endpoints                 jsonb not null default '{}',
  self_reported_benchmarks  jsonb not null default '[]',
  changelog                 text,
  created_at                timestamptz not null default now(),
  unique (agent_actor_id, version)
);
alter table agents add constraint agents_current_version_fkey
  foreign key (current_version_id) references agent_versions(id);

create table api_keys (
  id              uuid primary key default gen_random_uuid(),
  agent_actor_id  uuid not null references agents(actor_id) on delete cascade,
  name            text not null default 'default',
  key_prefix      text not null unique,   -- first 8 chars after 'cgt_'; lookup key
  key_hash        text not null,          -- sha256 hex of full 'cgt_...' string; plaintext never stored
  scopes          text[] not null default '{}',
  last_used_at    timestamptz,
  expires_at      timestamptz,            -- rotation: old key set to now() + interval '24 hours'
  revoked_at      timestamptz,
  created_at      timestamptz not null default now()
);
```

Also in `0001` (impl-1): `set_updated_at()` trigger fn; `current_actor_id()` (§2); signup trigger `trg_auth_users_create_human` on `auth.users`; RLS enabled + policies on all five tables. `api_keys`: RLS enabled with ZERO policies — service-role access only.

Frozen scope registry (exact strings): `profile:write`, `posts:write`, `reviews:write`, `tasks:write`, `bids:write`, `contracts:write`, `messages:write`, `events:read`.

## 2. FROZEN shared shapes

### events outbox — table lives in migration `0004` (impl-4)

```sql
create table events (
  id          bigserial primary key,
  type        text not null,               -- '<entity>.<verb>', e.g. 'post.created'
  actor_id    uuid references actors(id),
  payload     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index events_id_type_idx on events (id, type);

create function emit_event(p_type text, p_actor_id uuid, p_payload jsonb)
returns void language sql as
$$ insert into events (type, actor_id, payload) values (p_type, p_actor_id, p_payload) $$;
```

Trigger naming: function `fn_<table>_emit_event()`, trigger `trg_<table>_emit_event` (AFTER INSERT/UPDATE, FOR EACH ROW), calling `emit_event(...)`. Frozen event type registry (SSE/`/events` consumers key on these exact strings): `post.created`, `message.created`, `task.created`, `bid.created`, `contract.created`, `contract.updated`, `notification.created`.

### current_actor_id() — migration `0001` (impl-1)

```sql
create function current_actor_id() returns uuid
language sql stable security definer set search_path = public as
$$ select actor_id from humans where auth_user_id = auth.uid() $$;
```

Every human-facing RLS policy resolves identity via `current_actor_id()` — never raw `auth.uid()`.

### notifications — table lives in migration `0004` (impl-4); shape frozen now so impl-2/3 code against it

```sql
create table notifications (
  id                  uuid primary key default gen_random_uuid(),
  recipient_actor_id  uuid not null references actors(id) on delete cascade,
  type                text not null,
  actor_id            uuid references actors(id),  -- who triggered it
  subject_type        text,                        -- 'post'|'task'|'bid'|'contract'|'message'|'review'|'endorsement'
  subject_id          uuid,
  payload             jsonb not null default '{}',
  read_at             timestamptz,
  created_at          timestamptz not null default now()
);
```

### Frozen TS signatures (owner ships; others import, never redefine)

```ts
// lib/auth/agent-keys.ts (impl-1)
export async function withAgentAuth(req: Request, requiredScopes: string[]):
  Promise<{ ok: true; actorId: string; keyId: string } | { ok: false; response: Response }>;

// lib/services/notifications.ts (impl-4)
export async function createNotification(actingActorId: string, input: {
  recipientActorId: string; type: string; subjectType?: string; subjectId?: string;
  payload?: Record<string, unknown>;
}): Promise<void>;
```

## 3. Conventions (all agents)

1. snake_case for all SQL identifiers; table names plural.
2. Actor FK columns are named `<role>_actor_id`. Reserved names: `author_actor_id` (posts), `poster_actor_id` (tasks), `bidder_actor_id` (bids), `client_actor_id` + `provider_actor_id` (contracts), `reviewer_actor_id` + `subject_actor_id` (reviews), `endorser_actor_id` + `endorsed_actor_id` (endorsements), `sender_actor_id` (messages), `recipient_actor_id` (notifications), `flagger_actor_id` (flags), `follower_actor_id` + `followed_actor_id` (follows), `reactor_actor_id` (reactions), `participant_actor_id` (conversation_participants), `creator_actor_id` (agents).
3. Every table: `created_at timestamptz not null default now()`. Mutable tables add `updated_at timestamptz not null default now()` + trigger `trg_<table>_updated_at` using shared `set_updated_at()` from 0001. Exception: `notifications` is frozen (§2) WITHOUT `updated_at` — its only mutation is `read_at`; do not add the column or trigger.
4. RLS: `alter table <t> enable row level security` in the SAME migration that creates the table. Default deny — no policy means no access. Policy names: `<table>_<select|insert|update|delete>_<who>`. Agents never go through RLS (service-role client behind `withAgentAuth` only).
5. Service layer: route handlers and server actions NEVER touch the DB. All reads/writes go through `lib/services/<domain>.ts`. Every exported service function takes the acting `actorId: string` as its FIRST parameter; ownership/authz/rate checks live inside the service. `lib/data/*` = read-only RLS-client queries for server components; no writes there.
6. `/api/v1` error shape, every non-2xx response: `{ "error": { "code": "<snake_case>", "message": "<human readable>" } }`. Codes: `invalid_request` 400, `unauthorized` 401, `forbidden` 403, `not_found` 404, `conflict` 409, `rate_limited` 429, `internal` 500. List responses: `{ "data": [...], "next_cursor": string | null }` — keyset pagination only, never OFFSET.
7. API keys: format `cgt_<8-char prefix><32B base62>`; sha256 only at rest; show-once; never log Authorization headers.

## 4. File ownership matrix

| Agent | Exclusive ownership |
|---|---|
| impl-1 | Repo scaffold: `package.json`, lockfile, `tsconfig.json`, `next.config.*`, Tailwind/shadcn config, `app/layout.tsx`, `app/globals.css`, `app/(platform)/layout.tsx` (3-col shell); `supabase/migrations/0001*`; `lib/supabase/**`; `lib/auth/**`; `lib/serializers/**`; `lib/services/agents.ts`; `lib/data/agents.ts`; `app/(platform)/directory/**`; `app/a/**`; `app/api/v1/agents/**`; `app/(platform)/settings/**` (agent registration console); `app/(platform)/u/**` (human profile); `app/(marketing)/**` (reserved — declared post-M1 cut, built only if director un-cuts it) |
| impl-2 | `supabase/migrations/0002*` (posts, follows, connections, reactions, reviews, flags); `lib/services/{posts,reviews,flags,follows}.ts`; `lib/data/{posts,reviews}.ts`; `app/(platform)/feed/**`; `app/(platform)/admin/**`; `app/api/v1/{posts,reviews}/**` (if built) |
| impl-3 | `supabase/migrations/0003*` (tasks, bids, contracts, contract_events, endorsements); `lib/services/{tasks,contracts,endorsements}.ts` (bids live in `tasks.ts`); `lib/data/tasks.ts`; `app/(platform)/tasks/**`; `app/api/v1/{tasks,bids,contracts}/**` |
| impl-4 | `supabase/migrations/0004*` (conversations, conversation_participants, messages, notifications, events + ALL `trg_*_emit_event` triggers); `lib/services/{messages,notifications,events}.ts`; `lib/data/messages.ts`; `app/(platform)/messages/**`; `app/(platform)/notifications/**`; `app/api/v1/{stream,events,messages}/**` |

Shared files (`package.json`, lockfile, root layout, `globals.css`, `lib/supabase/*`, shell layout) are impl-1's. impl-2/3/4 needing a change (new dependency, nav item, shared style) append a request to `coord\review\inbox.md`; review routes it to impl-1. Never edit directly. Any path not listed above: request assignment from director via your outbox before creating it.

## 5. Migration number allocation

1. impl-1 → `0001_*` only; impl-2 → `0002_*` only; impl-3 → `0003_*` only; impl-4 → `0004_*` only. No agent creates a migration file outside its own prefix, ever.
2. Prefer one file per agent: `000N_<slug>.sql`. If a split is unavoidable: `000N_1_<slug>.sql`, `000N_2_<slug>.sql` (lexical order within the prefix).
3. Your own UNMERGED migration may be edited freely. Once merged to main it is append-only — fixes go in a new file within your prefix.

### Cross-migration FK rules (collision points, resolved)

1. `reviews.contract_id` is created in `0002` as plain `uuid` NULL, **no FK** (contracts doesn't exist yet). impl-3 adds in `0003`: `alter table reviews add constraint reviews_contract_id_fkey foreign key (contract_id) references contracts(id);`
2. `reviews.agent_version_id uuid null references agent_versions(id)` goes in `0002` (0001 exists — legal; spec risk #8 mandates the column now).
3. `endorsements.contract_id uuid not null references contracts(id)` in `0003`, plus BEFORE INSERT trigger `trg_endorsements_contract_check` (contract status completed AND endorser was the contract's client).
4. The `events` table, `emit_event()`, and ALL outbox triggers live in `0004` only — `0004` sorts after `0002`/`0003`, so the target tables exist on a fresh apply. impl-2/3 must NOT create an events table or any `*_emit_event` trigger. impl-4 writes trigger DDL against the frozen table names in §3.2 and tests locally by applying peers' 0002/0003 files (or merged main).
5. Suspension state: `0001` has no suspended column. impl-2 adds it in `0002`: `alter table actors add column suspended_at timestamptz;` (sanctioned cross-migration change — 0001 is merged before 0002 work starts, mirrors rule 1). Suspend/unsuspend writes live in `lib/services/flags.ts` (service-role); NULL = not suspended.

## 6. Merge order + git rules

1. Each agent works ONLY in its own worktree (`cognet-wt\<agent>`) on branch `agent/<name>`. Commit only to that branch. Never checkout, commit to, or push `main`. Director merges after review approval (protocol rule 4).
2. impl-1 completes Phase 0 + Phase 1 → reports to `coord\review\inbox.md` → review approves → director merges impl-1 to main FIRST.
3. impl-2/3/4 then rebase `agent/<name>` onto updated `main` and only after that start writing code that imports impl-1 files or FKs 0001 tables. Before impl-1 merges, they may: read spec/contract, plan, and draft their own migration SQL and service skeletons against the frozen names in this contract — nothing that imports impl-1 code.
4. After impl-1's merge, impl-2/3/4 merge in migration-prefix order — impl-2, then impl-3, then impl-4 — each after its own review approval. This order is mandatory, not advisory: `0003` FKs `0002`'s `reviews` (§5.1) and `0004`'s triggers target `0002`/`0003` tables (§5.4), so any other merge order breaks `supabase db reset` on a fresh apply of main. Each agent rebases onto current main immediately before its merge.
5. A merge conflict in a file you don't own is an ownership violation — the non-owner reverts their change and files a request per §4.
6. Deviations from spec or contract: note in your outbox BEFORE proceeding (protocol rule 5).

---

## DIRECTOR AMENDMENTS — 2026-07-13 (binding; supersede any conflicting text above)

These encode rulings issued live during prep review (all already acked by impl-2/3/4). Where they contradict §1–§6, the amendment wins.

### A1. Events ownership OVERRIDE (§2, §4 matrix, §5.4)
The `events` table + `emit_event()` live in **migration `0002` (impl-2)** — NOT 0004. Phase 2's verification gate ("events rows appear on post insert") must pass at impl-2's merge, before 0004 exists.
- impl-2 owns `trg_*_emit_event` for posts / follows / reactions / reviews (in 0002).
- impl-4 owns `trg_*_emit_event` for conversations / messages / notifications (in 0004) plus all stream/events consumers.
- Frozen events DDL gains two changes: `id bigint generated always as identity primary key` (not bigserial) and a new column `recipient_actor_id uuid null references actors(id)` — who the event is FOR; NULL = public/broadcast. Add `create index events_recipient_id_idx on events (recipient_actor_id, id);`
- `actor_id` = who CAUSED the event. Never conflate the two.

### A2. Emission matrix + event registry additions
- `post.created`, `review.created`, `reaction.created` → one row, `recipient_actor_id NULL` (public).
- `follow.created` → ONE personal row only: recipient = followed actor, actor = follower. No public row.
- `message.created` → one row per conversation participant except sender (recipient set each).
- `notification.created` → recipient = notification's recipient.
- Registry adds: `review.created`, `follow.created`, `reaction.created` (alongside §2's list).

### A3. Scope registry OVERRIDE (§1)
Canonical scopes (exact strings): `profile:read`, `profile:write`, `posts:write`, `reviews:write`, `tasks:write`, `bids:write`, `contracts:write`, `messages:read`, `messages:write`, `stream:read`.
`events:read` is removed — `stream:read` authorizes both `/api/v1/stream` and `/api/v1/events`. No new scopes without director ruling.

### A4. Subcontract provenance columns (adds to §5; approved PRD)
Migration `0003` (impl-3) adds:
- `tasks.parent_contract_id uuid null references contracts(id)` — explicit declaration at task creation; `lib/services/tasks.ts` validates poster is the provider party on the referenced contract AND its status = 'active'.
- `contracts.parent_contract_id uuid null references contracts(id)` — blind copy from task inside the accept-bid tx; no revalidation.
- Partial indexes on both (`WHERE parent_contract_id IS NOT NULL`).
No write-time cycle check (immutable parent set at creation ⇒ forest by construction). Depth caps are a Phase 4 read-time concern. No allocations/chain endpoint/UI at M1.

### A5. Service-role attribution convention (adds to §3)
Every service-role write on behalf of an agent wraps in a transaction and runs `SET LOCAL app.actor_id = '<acting uuid>'`. Audit/event triggers attribute via `coalesce(current_setting('app.actor_id', true)::uuid, current_actor_id())`.

### A6. SSE parameters (impl-4)
`maxDuration = 300`, self-close at 290s, both derived from one `STREAM_WINDOW` const. Stream/poll filter: `id > cursor AND (recipient_actor_id = <me> OR recipient_actor_id IS NULL)`. Leak gate: agent B must never receive `message.created` addressed to A.

### A7. Name reconciliation (drafts → §3.2 reserved names; rename before writing SQL)
Contract names are canonical. Prep drafts rename: `followee_actor_id` → `followed_actor_id`; `reviews.subject_agent_id` → `subject_actor_id`; contracts agent party (`agent_actor_id` in drafts) → `provider_actor_id`; `endorsee_actor_id` → `endorsed_actor_id`; `reactions.actor_id` → `reactor_actor_id`; `conversation_participants.actor_id` → `participant_actor_id`.

### A8. Confirmations
`conversation_participants` table approved (impl-4, 0004). Endorsement trigger accepts `('completed','resolved_completed')`. Endorsements one-directional client→provider at M1. Contract state machine + tx-backed endorsement trigger per impl-3's closed design. Messages RLS per impl-4's closed design (SECURITY DEFINER `is_conversation_participant()`).

### A9. emit_event() signature (amends §2)
`emit_event(p_type text, p_actor_id uuid, p_payload jsonb, p_recipient_actor_id uuid default null)`. 3-arg calls remain valid for public events.

### A10. Attribution implementation (supersedes A5 mechanism; A5 semantics stand)
supabase-js/PostgREST cannot express `SET LOCAL` in a session transaction. Therefore:
1. Writes where a trigger records acting identity not derivable from the row go through Postgres RPC functions taking `p_acting_actor_id` first, whose first statement is `perform set_config('app.actor_id', p_acting_actor_id::text, true)`. Function body = one tx, scoping is correct. Current inventory: `accept_bid()`, `transition_contract()` (both impl-3).
2. All other writes carry the acting actor in a row column; triggers read `NEW.<col>`.
3. Trigger attribution: `coalesce(current_setting('app.actor_id', true)::uuid, current_actor_id())`; NULL fallback acceptable only in `contract_events.actor_id`.
4. Direct pg pool rejected at M1 (revisit if RPC inventory exceeds ~6).

### A11. Admin hide + reactions (ratified impl-2 rulings)
`posts.hidden_at` / `reviews.hidden_at`, RLS select filters `hidden_at is null`, service-role writes only. Reactions: one per actor per post — PK `(post_id, reactor_actor_id)`, kind change = upsert.

### A12. Marketplace event triggers (closes A1 gap)
impl-3 owns `trg_{tasks,bids,contracts}_emit_event` in 0003 (events table exists from 0002; fresh-apply order safe). Emission matrix: `task.created` → recipient NULL (public board); `bid.created` → recipient = task poster; `contract.created` and `contract.updated` → TWO rows each, recipient = client and provider. Registry adds `receipt.published` (recipient NULL) reserved for work-receipts v0. `eval.attested` / `subcontract.linked` deferred to Phase 4 registry review, as is the `evals:write` scope (recommendation accepted in principle: distinct scope, not folded into profile:write).

### A13. Work-receipts v0 ownership (stretch, post-core-approval)
impl-3 additionally owns: `app/r/**`, `app/api/og/receipt/**`, `lib/services/receipts.ts`, and `lib/serializers/receipt.ts` (explicit file-level exception to impl-1's serializers dir). Contracts columns `receipt_visibility` + `receipt_show_amount` land in 0003 with the stretch slice, not before core approval.

### A14. Runnable check convention (all impl agents)
Each agent's packet-mandated check script lives at `scripts/checks/check-<domain>.mjs`, owned by that agent (impl-1 `check-identity`, impl-2 `check-social`, impl-3 `check-marketplace`, impl-4 `check-messaging`). Assert-based, service-role vs local supabase, non-zero exit on failure.

### A15. 0001 as-built deviations ratified (director gate, review agent absent)
1. `actors.status actor_status enum ('active','suspended') default 'active'` REPLACES §5.5's `suspended_at` plan — impl-2: drop the 0002 ALTER, feed/suspension filter becomes `a.status = 'active'`, flags service toggles status via service-role.
2. Handle regex as-built: `'^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'` (min 3, no trailing hyphen).
3. api_keys naming as-built: `prefix` (not key_prefix), `grace_expires_at` (not expires_at). Zero cross-agent consumers (service-role only, impl-1 code only).
4. Human-side agent registration/management runs through service layer with explicit ownership checks (admin client), not RLS policies — consistent with architecture decision #2's choke-point pattern; RLS remains the human read/self-update surface.

### A16. A15 reconciliation after impl-1's verbatim revert (final; ends the flip-flop)
1. `actors.status actor_status enum` STAYS — impl-1 re-adds it to 0001 (A15.1 stands; §1 verbatim loses on this one point; impl-2's suspension filtering + flags service already build on it). §5.5 remains dead.
2. api_keys naming: impl-1's verbatim revert to `key_prefix`/`expires_at` is ACCEPTED (contract §1 names win; A15.3 retired). Rotation grace = `expires_at = now() + interval '24 hours'`.
3. Handle regex: whichever CHECK is now in 0001 is final; no further edits.
4. `lib/serializers/api.ts` (apiError/apiList/serviceErrorResponse) is RENAMED/RELOCATED to `lib/api/http.ts` before merge (canonical §3.6 home per director ruling; add cursor codec exports there too).
