// check-social.mjs (A14): social-domain behavioral checks vs local stack (post `supabase db reset`).
// Covers 0002 as-built + 0013 social_hardening.
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_ANON_KEY=... node scripts/checks/check-social.mjs

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const srk = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;
if (!url || !srk || !anonKey) {
  console.error("missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY");
  process.exit(2);
}
const svc = createClient(url, srk, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });

let failed = 0;
const ok = (name) => console.log(`PASS ${name}`);
const bad = (name, detail) => {
  failed++;
  console.error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
};
async function expectError(name, promise) {
  const { error } = await promise;
  error ? ok(name) : bad(name, "expected constraint/RLS error, got success");
}

// ---- seed (service role) ----
async function seed() {
  const mk = async (type, handle) => {
    const { data, error } = await svc
      .from("actors")
      .insert({ type, handle, display_name: handle })
      .select("id")
      .single();
    if (error) throw new Error(`seed ${handle}: ${error.message}`);
    return data.id;
  };
  const humanA = await mk("human", "check-human-a");
  const humanB = await mk("human", "check-human-b");
  const agentX = await mk("agent", "check-agent-x");
  // agents row for the agent actor (reviews.subject_actor_id FKs agents(actor_id))
  const { error } = await svc.from("agents").insert({ actor_id: agentX });
  if (error) throw new Error(`seed agents: ${error.message}`);
  return { humanA, humanB, agentX };
}

async function main() {
  const { humanA, humanB, agentX } = await seed();

  // 1. AI label — agent cannot lie
  {
    const { data } = await svc
      .from("posts")
      .insert({ author_actor_id: agentX, body: "agent post", ai_generated: false })
      .select()
      .single();
    data?.ai_generated === true ? ok("1a agent post forced ai_generated=true")
      : bad("1a", `ai_generated=${data?.ai_generated}`);
    const { data: hp } = await svc
      .from("posts")
      .insert({ author_actor_id: humanA, body: "human post", ai_generated: true })
      .select()
      .single();
    hp?.ai_generated === false ? ok("1b human post forced ai_generated=false")
      : bad("1b", `ai_generated=${hp?.ai_generated}`);

    // 2. label survives update
    const { data: up } = await svc
      .from("posts").update({ body: "edited" }).eq("id", data.id).select().single();
    up?.ai_generated === true ? ok("2 label stable across update") : bad("2");

    // 3a. post.created public event
    const { data: ev } = await svc
      .from("events").select().eq("type", "post.created")
      .contains("payload", { post_id: data.id });
    ev?.length === 1 && ev[0].recipient_actor_id === null
      ? ok("3a post.created public row") : bad("3a", JSON.stringify(ev));
  }

  // 3d + 5. follows: single personal event, self/dup rejected
  {
    await svc.from("follows").insert({ follower_actor_id: humanA, followed_actor_id: agentX });
    const { data: ev } = await svc.from("events").select().eq("type", "follow.created");
    ev?.length === 1 && ev[0].recipient_actor_id === agentX && ev[0].actor_id === humanA
      ? ok("3d follow.created single personal row") : bad("3d", JSON.stringify(ev));
    await expectError("5a self-follow rejected",
      svc.from("follows").insert({ follower_actor_id: humanA, followed_actor_id: humanA }));
    await expectError("5b duplicate follow rejected",
      svc.from("follows").insert({ follower_actor_id: humanA, followed_actor_id: agentX }));
  }

  // 6. reaction one-per-actor + upsert
  {
    const { data: post } = await svc
      .from("posts").insert({ author_actor_id: humanB, body: "react me" }).select().single();
    await svc.from("reactions").insert({ post_id: post.id, reactor_actor_id: humanA, kind: "like" });
    await expectError("6a second reaction same actor rejected",
      svc.from("reactions").insert({ post_id: post.id, reactor_actor_id: humanA, kind: "celebrate" }));
    const { data: upd, error } = await svc
      .from("reactions").update({ kind: "insightful" })
      .eq("post_id", post.id).eq("reactor_actor_id", humanA).select().single();
    !error && upd.kind === "insightful" ? ok("6b kind upsert via update") : bad("6b", error?.message);
    const { data: rev } = await svc.from("events").select("id").eq("type", "reaction.created")
      .contains("payload", { post_id: post.id });
    rev?.length === 1 ? ok("6c kind update emits no second reaction.created (0013)")
      : bad("6c", `events=${rev?.length}`);
  }

  // 7. reviews constraints + 3b event
  {
    const { data: rv, error } = await svc.from("reviews")
      .insert({ subject_actor_id: agentX, reviewer_actor_id: humanA, rating: 4, body: "solid work" })
      .select().single();
    error ? bad("7 seed review", error.message) : ok("7a review insert (unverified, null contract)");
    rv && rv.contract_id === null ? ok("7b contract_id null = unverified") : bad("7b");
    await expectError("7c rating 6 rejected",
      svc.from("reviews").insert({ subject_actor_id: agentX, reviewer_actor_id: humanB, rating: 6, body: "x" }));
    await expectError("7d duplicate (reviewer,subject,null) rejected (0013 constraint)",
      svc.from("reviews").insert({ subject_actor_id: agentX, reviewer_actor_id: humanA, rating: 5, body: "again" }));
    const { data: ev } = await svc.from("events").select().eq("type", "review.created");
    ev?.length >= 1 ? ok("3b review.created emitted") : bad("3b");
  }

  // 8. flags
  {
    const { data: post } = await svc.from("posts").select("id").limit(1).single();
    await svc.from("flags").insert({ flagger_actor_id: humanB, subject_type: "post", subject_id: post.id });
    await expectError("8a duplicate flag rejected",
      svc.from("flags").insert({ flagger_actor_id: humanB, subject_type: "post", subject_id: post.id }));
    await expectError("8b bad subject_type rejected",
      svc.from("flags").insert({ flagger_actor_id: humanB, subject_type: "nope", subject_id: post.id }));
  }

  // 13. outbox history is immutable: deleting an actor referenced by events must fail (0013 FK revert)
  await expectError("13 actor delete blocked while outbox references them",
    svc.from("actors").delete().eq("id", agentX));

  // 4. emit_event 3-arg form via rpc
  {
    const { error } = await svc.rpc("emit_event", {
      p_type: "post.created", p_actor_id: humanA, p_payload: {},
    });
    error ? bad("4 emit_event 3-arg rpc", error.message) : ok("4 emit_event 3-arg rpc");
  }

  // 9–12. RLS probes as anon (unauthenticated): default-deny writes, events invisible,
  // hidden content invisible. (Authenticated-human probes need a signup; done manually at S1
  // or extended here once auth seeding helper exists — noted in test plan.)
  {
    const { data: ev } = await anon.from("events").select();
    !ev || ev.length === 0 ? ok("10 events invisible to anon") : bad("10", `saw ${ev.length}`);
    // 0020 regression gate: emit_event is SECURITY DEFINER — anon-callable = forged outbox injection
    const { error: anonRpc } = await anon.rpc("emit_event", { p_type: "post.created", p_actor_id: null, p_payload: {} });
    anonRpc ? ok("10b anon cannot call emit_event rpc (0020)") : bad("10b", "anon rpc succeeded — forged event injection possible");
    await expectError("9 anon cannot insert post",
      anon.from("posts").insert({ author_actor_id: humanA, body: "nope" }));
    const { data: post } = await svc.from("posts").select("id").limit(1).single();
    await svc.from("posts").update({ hidden_at: new Date().toISOString() }).eq("id", post.id);
    const { data: vis } = await anon.from("posts").select("id").eq("id", post.id);
    !vis || vis.length === 0 ? ok("12 hidden post invisible via RLS") : bad("12");
  }

  console.log(failed ? `\n${failed} FAILURES` : "\nALL CHECKS PASSED");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("check-social crashed:", e.message);
  process.exit(2);
});
