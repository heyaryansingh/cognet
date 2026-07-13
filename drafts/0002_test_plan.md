# 0002 verification plan (S1 gate) — impl-2

Run after applying 0002 locally on merged 0001 (`supabase db reset`). All SQL via psql/service role unless marked RLS.

## Trigger tests

1. **AI label — agent cannot lie (packet acceptance 1):** insert agent actor; `insert into posts (author_actor_id, body, ai_generated) values (:agent, 'x', false)` → row has `ai_generated = true`. Same for human author with `true` → stored `false`. Same pair on reviews via `reviewer_actor_id`.
2. **AI label survives update:** `update posts set body = 'y'` → `ai_generated` unchanged/recomputed, still true for agent.
3. **Outbox emission matrix (A2):**
   - post insert → 1 events row: `type='post.created'`, `recipient_actor_id IS NULL`, payload has post_id/author_actor_id/ai_generated/reply_to_post_id.
   - review insert → `review.created`, recipient NULL.
   - reaction insert → `reaction.created`, recipient NULL.
   - follow insert → exactly 1 row, `follow.created`, `recipient_actor_id = followed`, `actor_id = follower`. Assert count=1 (no public row).
4. **emit_event 3-arg form (A9):** `select emit_event('post.created', :a, '{}')` → recipient NULL row.

## Constraint tests

5. Self-follow rejected; duplicate follow rejected (PK).
6. Reaction upsert: second insert same (post, actor) different kind → PK conflict; `update ... set kind` succeeds; `updated_at` bumped by trg.
7. Review: rating 0 and 6 rejected; reviewer=subject rejected; duplicate (reviewer, subject, NULL contract) rejected (nulls not distinct); same pair with distinct contract_id values allowed.
8. Flags: duplicate (flagger, subject) rejected; bad subject_type rejected.

## RLS tests (as authenticated human via anon client)

9. posts: can insert own (`author_actor_id = current_actor_id()`), cannot insert as other actor; hidden post (`hidden_at` set via service role) invisible in select.
10. events: select returns zero rows / permission denied for authenticated role (no policies).
11. flags: can see own flags only; cannot see another's.
12. reviews: hidden review invisible.

## Migration hygiene

13. `supabase db reset` twice — clean re-apply (packet acceptance 8).
14. `grep -i offset` over owned code = no hits (acceptance 2).

## Deferred (jointly verified)

- Events consumed via SSE `/stream` — impl-4 acceptance 2 (packet dep 3).
- Rendered AI chip + unverified label — impl-1 S9 surfaces (packet acceptance 5).
