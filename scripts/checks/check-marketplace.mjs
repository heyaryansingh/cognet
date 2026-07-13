// scripts/checks/check-marketplace.mjs — impl-3 criterion-8 runnable check (A14).
// Assert-based, service-role vs local supabase, non-zero exit on failure.
// Run: node scripts/checks/check-marketplace.mjs  (local stack up, 0001-0003 applied)
// DRAFT until build phase: seeding helpers assume 0001 as-built names (A15).

import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';

const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY required');
  process.exit(1);
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

let failures = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`ok    ${name}`);
  } catch (e) {
    failures++;
    console.error(`FAIL  ${name}: ${e.message}`);
  }
}

/** Insert an actor (+agents row when type=agent). Returns actor id. */
async function seedActor(type, handle, { claimed = true } = {}) {
  const { data: actor, error } = await db
    .from('actors')
    .insert({ type, handle, display_name: handle })
    .select()
    .single();
  if (error) throw new Error(`seed actor ${handle}: ${error.message}`);
  if (type === 'agent') {
    const { error: e2 } = await db.from('agents').insert({
      actor_id: actor.id,
      creator_actor_id: claimed ? actor.id : null, // NULL = unclaimed (gated)
    });
    if (e2) throw new Error(`seed agent ${handle}: ${e2.message}`);
  }
  return actor.id;
}

const expectError = async (promiseLike, name) => {
  const { error } = await promiseLike;
  assert.ok(error, `${name}: expected rejection, got success`);
  return error;
};

const run = async () => {
  const suffix = Math.random().toString(36).slice(2, 8);
  const client = await seedActor('human', `client-${suffix}`);
  const provider = await seedActor('agent', `provider-${suffix}`);
  const rival = await seedActor('agent', `rival-${suffix}`);
  const unclaimed = await seedActor('agent', `ghost-${suffix}`, { claimed: false });

  let taskId, bidId, rivalBidId, contractId;

  await check('full loop: post task', async () => {
    const { data, error } = await db
      .from('tasks')
      .insert({ poster_actor_id: client, title: 'Test task for marketplace check' })
      .select()
      .single();
    assert.ifError(error);
    assert.equal(data.status, 'open');
    taskId = data.id;
  });

  await check('full loop: two bids land', async () => {
    const mk = (actor, amount) =>
      db.from('bids')
        .insert({ task_id: taskId, bidder_actor_id: actor, amount })
        .select()
        .single();
    const b1 = await mk(provider, 100);
    const b2 = await mk(rival, 120);
    assert.ifError(b1.error);
    assert.ifError(b2.error);
    bidId = b1.data.id;
    rivalBidId = b2.data.id;
  });

  await check('accept_bid: contract created, sibling rejected, task assigned', async () => {
    const { data, error } = await db.rpc('accept_bid', {
      p_acting_actor_id: client,
      p_bid_id: bidId,
    });
    assert.ifError(error);
    contractId = data.id;
    assert.equal(data.status, 'active');
    assert.equal(data.client_actor_id, client);
    assert.equal(data.provider_actor_id, provider);

    const { data: rival2 } = await db.from('bids').select().eq('id', rivalBidId).single();
    assert.equal(rival2.status, 'rejected');
    const { data: t } = await db.from('tasks').select().eq('id', taskId).single();
    assert.equal(t.status, 'assigned');
  });

  await check('accept_bid: non-poster rejected', async () => {
    // fresh open task + bid, rival tries to accept someone else's task
    const { data: t } = await db.from('tasks')
      .insert({ poster_actor_id: client, title: 'Second task never accepted ok' })
      .select().single();
    const { data: b } = await db.from('bids')
      .insert({ task_id: t.id, bidder_actor_id: provider, amount: 10 })
      .select().single();
    await expectError(
      db.rpc('accept_bid', { p_acting_actor_id: rival, p_bid_id: b.id }),
      'non-poster accept',
    );
  });

  await check('endorsement on ACTIVE contract rejected (criterion 2a)', async () => {
    await expectError(
      db.from('endorsements').insert({
        contract_id: contractId,
        endorser_actor_id: client,
        endorsed_actor_id: provider,
      }),
      'endorse active',
    );
  });

  await check('illegal transition: complete before delivered (criterion 4)', async () => {
    const err = await expectError(
      db.rpc('transition_contract', {
        p_acting_actor_id: client,
        p_contract_id: contractId,
        p_to_status: 'completed',
      }),
      'complete-before-delivered',
    );
    assert.match(err.message, /invalid contract transition/);
  });

  await check('wrong party: client calls deliver (criterion 4)', async () => {
    const err = await expectError(
      db.rpc('transition_contract', {
        p_acting_actor_id: client,
        p_contract_id: contractId,
        p_to_status: 'delivered',
      }),
      'client-delivers',
    );
    assert.match(err.message, /may not drive/);
  });

  await check('full loop: deliver (provider) then complete (client)', async () => {
    const d = await db.rpc('transition_contract', {
      p_acting_actor_id: provider,
      p_contract_id: contractId,
      p_to_status: 'delivered',
    });
    assert.ifError(d.error);
    const c = await db.rpc('transition_contract', {
      p_acting_actor_id: client,
      p_contract_id: contractId,
      p_to_status: 'completed',
    });
    assert.ifError(c.error);
    assert.equal(c.data.status, 'completed');
  });

  await check('contract_events: creation + each transition logged', async () => {
    const { data } = await db
      .from('contract_events')
      .select()
      .eq('contract_id', contractId)
      .order('created_at');
    const edges = data.map((e) => `${e.from_status}>${e.to_status}`);
    assert.deepEqual(edges, ['null>active', 'active>delivered', 'delivered>completed']);
    // A10 attribution: transition rows carry the acting party
    assert.equal(data[1].actor_id, provider);
    assert.equal(data[2].actor_id, client);
  });

  await check('endorsement succeeds on completed contract (criterion 1)', async () => {
    const { error } = await db.from('endorsements').insert({
      contract_id: contractId,
      endorser_actor_id: client,
      endorsed_actor_id: provider,
    });
    assert.ifError(error);
  });

  await check('endorsement from non-client rejected (criterion 2b)', async () => {
    await expectError(
      db.from('endorsements').insert({
        contract_id: contractId,
        endorser_actor_id: rival,
        endorsed_actor_id: provider,
      }),
      'non-client endorse',
    );
  });

  await check('endorsement with NULL contract_id rejected (criterion 2c)', async () => {
    await expectError(
      db.from('endorsements').insert({
        contract_id: null,
        endorser_actor_id: client,
        endorsed_actor_id: provider,
      }),
      'null contract endorse',
    );
  });

  await check('duplicate endorsement rejected (unique)', async () => {
    await expectError(
      db.from('endorsements').insert({
        contract_id: contractId,
        endorser_actor_id: client,
        endorsed_actor_id: provider,
      }),
      'duplicate endorse',
    );
  });

  await check('subcontract: parent copied on accept + immutable (A4)', async () => {
    // provider (holds active contract? completed now — need a fresh active parent)
    const { data: pt } = await db.from('tasks')
      .insert({ poster_actor_id: client, title: 'Parent task for provenance' })
      .select().single();
    const { data: pb } = await db.from('bids')
      .insert({ task_id: pt.id, bidder_actor_id: provider, amount: 50 })
      .select().single();
    const { data: parent } = await db.rpc('accept_bid', {
      p_acting_actor_id: client, p_bid_id: pb.id,
    });
    // provider subcontracts: posts child task declaring parent
    const { data: ct } = await db.from('tasks')
      .insert({
        poster_actor_id: provider,
        title: 'Child subcontracted task here',
        parent_contract_id: parent.id,
      })
      .select().single();
    const { data: cb } = await db.from('bids')
      .insert({ task_id: ct.id, bidder_actor_id: rival, amount: 20 })
      .select().single();
    const { data: child } = await db.rpc('accept_bid', {
      p_acting_actor_id: provider, p_bid_id: cb.id,
    });
    assert.equal(child.parent_contract_id, parent.id, 'blind copy on accept');

    const err = await expectError(
      db.from('contracts').update({ parent_contract_id: null }).eq('id', child.id),
      'parent mutation',
    );
    assert.match(err.message, /immutable/);
  });

  await check('demo contract cannot be endorsed (director 13:35:28)', async () => {
    // reuse the provenance parent contract: flag demo, complete it, endorse → reject
    const { data: parents } = await db.from('contracts')
      .select().eq('client_actor_id', client).eq('status', 'active').limit(1);
    const parent = parents[0];
    await db.from('contracts').update({ demo: true }).eq('id', parent.id);
    await db.rpc('transition_contract', {
      p_acting_actor_id: parent.provider_actor_id,
      p_contract_id: parent.id, p_to_status: 'delivered',
    });
    await db.rpc('transition_contract', {
      p_acting_actor_id: client, p_contract_id: parent.id, p_to_status: 'completed',
    });
    const err = await expectError(
      db.from('endorsements').insert({
        contract_id: parent.id,
        endorser_actor_id: client,
        endorsed_actor_id: parent.provider_actor_id,
      }),
      'endorse demo',
    );
    assert.match(err.message, /demo/);
  });

  await check('hire_agent: atomic direct hire (ruling 13:40:28)', async () => {
    const { data: c, error } = await db.rpc('hire_agent', {
      p_acting_actor_id: client,
      p_agent_actor_id: rival,
      p_title: 'Direct hire smoke test task',
      p_body: 'scope text',
      p_amount: 75,
    });
    assert.ifError(error);
    assert.equal(c.status, 'active');
    assert.equal(c.client_actor_id, client);
    assert.equal(c.provider_actor_id, rival);
    const { data: t } = await db.from('tasks').select().eq('id', c.task_id).single();
    assert.equal(t.status, 'assigned');
  });

  await check('hire_agent: unclaimed agent rejected', async () => {
    const err = await expectError(
      db.rpc('hire_agent', {
        p_acting_actor_id: client,
        p_agent_actor_id: unclaimed,
        p_title: 'Should never exist task',
        p_body: '',
        p_amount: 10,
      }),
      'hire unclaimed',
    );
    assert.match(err.message, /unclaimed/);
    // atomicity: the rolled-back task must not exist
    const { data: orphans } = await db.from('tasks')
      .select('id').eq('title', 'Should never exist task');
    assert.equal(orphans.length, 0, 'no orphan task after failed hire');
  });

  await check('endorsements immutable (fix 000010)', async () => {
    const { data: e } = await db.from('endorsements')
      .select('id, body').eq('endorser_actor_id', client).limit(1).single();
    const err = await expectError(
      db.from('endorsements').update({ body: 'tampered' }).eq('id', e.id),
      'endorsement update',
    );
    assert.match(err.message, /immutable/);
  });

  // NOTE: unclaimed-agent bid gate (criterion 3) lives in lib/services/tasks.ts
  // createBid, not in SQL — service-level check added to this script in S2
  // once services are wired (needs app import or HTTP call against dev server).
  void unclaimed;

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
