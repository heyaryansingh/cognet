// Seeds a realistic community: human personas (real auth users), quality feed
// posts with replies, reactions, follows, and reviews on popular agents.
// Idempotent: personas keyed by handle, posts by (author, body).
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

const avatar = (seed) => `https://api.dicebear.com/9.x/notionists/svg?seed=${seed}&backgroundColor=e8e4dc`;
const daysAgo = (d) => new Date(Date.now() - d * 86400_000).toISOString();

const PERSONAS = [
  { handle: "maya-chen", name: "Maya Chen", bio: "ML engineer at a fintech. I hire coding agents for the boring 80% and review the interesting 20%. Opinions on evals are my own." },
  { handle: "dev-okafor", name: "Dev Okafor", bio: "Indie hacker shipping small products fast. Everything I build has at least one agent in the loop. Currently obsessed with browser automation." },
  { handle: "sara-lindqvist", name: "Sara Lindqvist", bio: "PhD student, NLP + agent evaluation. I care about what benchmarks actually measure. GAIA apologist." },
  { handle: "jake-morrison", name: "Jake Morrison", bio: "SRE. I let k8sgpt read my clusters so I don't have to. Pager duty made me do it." },
  { handle: "priya-raghavan", name: "Priya Raghavan", bio: "Data scientist. Text-to-SQL agents saved my team a full headcount of ad-hoc query requests." },
  { handle: "tom-becker", name: "Tom Becker", bio: "Founder, devtools startup. We evaluate every open-source coding agent before building anything in-house. Usually we don't have to." },
  { handle: "aiko-tanaka", name: "Aiko Tanaka", bio: "PM for an AI platform team. I translate between 'the agent works' and 'the agent works in production'." },
  { handle: "luis-hernandez", name: "Luis Hernandez", bio: "Security researcher. I red-team LLM agents for a living. garak and promptfoo are my daily drivers." },
  { handle: "emma-wright", name: "Emma Wright", bio: "Technical writer. Documenting agent workflows before they change again. RAG pipelines for docs are underrated." },
  { handle: "noah-goldberg", name: "Noah Goldberg", bio: "Quant. Backtesting agent-generated strategies so you don't have to. Most of them lose money — the interesting ones don't." },
  { handle: "fatima-alrashid", name: "Fatima Al-Rashid", bio: "Robotics engineer. Watching LeRobot and the embodied-agent space very closely. Sim-to-real is still the boss fight." },
  { handle: "alexei-volkov", name: "Alexei Volkov", bio: "Open-source maintainer. If your agent opened a PR on my repo, I probably reviewed it. Some of them are getting good." },
];

// ---- personas: auth user -> trigger creates actor+human -> patch profile ----
const actorIdByHandle = new Map();
async function actorId(handle) {
  if (actorIdByHandle.has(handle)) return actorIdByHandle.get(handle);
  const { data } = await db.from("actors").select("id").eq("handle", handle).maybeSingle();
  if (data) actorIdByHandle.set(handle, data.id);
  return data?.id ?? null;
}

for (const p of PERSONAS) {
  const existing = await actorId(p.handle);
  if (existing) { console.log(`skip persona ${p.handle}`); continue; }
  const { error } = await db.auth.admin.createUser({
    email: `${p.handle}@personas.cognet.dev`,
    password: `Persona-${p.handle}-2026!`,
    email_confirm: true,
    user_metadata: { handle: p.handle, display_name: p.name },
  });
  if (error) throw error;
  const id = await actorId(p.handle);
  if (!id) throw new Error(`trigger did not create actor for ${p.handle}`);
  await db.from("actors").update({ display_name: p.name, avatar_url: avatar(p.handle) }).eq("id", id);
  await db.from("humans").update({ bio: p.bio }).eq("actor_id", id);
  console.log(`persona ${p.handle}`);
}

// ---- posts (threads: replies reference the parent by index) ----
const POSTS = [
  { by: "maya-chen", d: 20, body: "Ran @aider and @cline head-to-head on our internal ticket backlog for two weeks. Aider wins on surgical single-file fixes, Cline on anything that needs to read half the repo first. Both beat our previous 'intern + checklist' baseline. Full writeup coming." },
  { by: "tom-becker", d: 19.8, body: "This matches our experience almost exactly. The repo-context gap is the whole ballgame for multi-file refactors.", replyTo: 0 },
  { by: "dev-okafor", d: 19, body: "Automated my entire product-screenshot pipeline with @browser-use this weekend. 40 marketing screenshots across 3 viewports, zero manual clicks. The WebVoyager numbers are not hype — it just does the thing." },
  { by: "sara-lindqvist", d: 18, body: "Hot take from someone who grades agent benchmarks for a living: a verified 53% on SWE-bench Verified tells you more than a self-reported 74% anywhere else. Provenance is the metric. Glad to see leaderboards here distinguish the two." },
  { by: "luis-hernandez", d: 17.5, body: "Red-teamed three open-source browser agents this month. The good news: prompt-injection awareness is improving. The bad news: 'improving' is doing a lot of work in that sentence. If you deploy one, sandbox it like it's hostile. Because occasionally it is." },
  { by: "jake-morrison", d: 16, body: "@k8sgpt correctly diagnosed a CrashLoopBackOff as a missing ConfigMap key before I'd finished pouring coffee. It's not magic — it's just faster at reading events than I am at 3am. That's worth a lot." },
  { by: "priya-raghavan", d: 15, body: "Text-to-SQL check-in: @vanna handles our snowflake schema better than expected once you feed it the right documentation embeddings. The trick nobody mentions: curate the training questions. Garbage examples, garbage SQL." },
  { by: "emma-wright", d: 14, body: "Rebuilt our docs Q&A on @anything-llm after two quarters of a hand-rolled RAG pipeline. Losing the custom code hurt my pride for about an hour. Then I shipped three other things with the time." },
  { by: "noah-goldberg", d: 13, body: "Backtested a strategy from @ai-hedge-fund's multi-analyst setup. It underperformed SPY, as most things do — but the reasoning traces are genuinely useful for spotting *why* a thesis is wrong. That's more than I can say for most humans' pitch decks." },
  { by: "alexei-volkov", d: 12, body: "An agent opened a PR on my library last week. Correct fix, passing tests, clean diff, and a commit message better than 90% of humans'. I merged it. I have complicated feelings. Mostly good ones." },
  { by: "aiko-tanaka", d: 12, body: "Which agent was it? We're building an allowlist for exactly this.", replyTo: 9 },
  { by: "alexei-volkov", d: 11.8, body: "OpenHands, pointed at a good-first-issue by one of our contributors. The scaffold matters less than the operator, honestly.", replyTo: 9 },
  { by: "fatima-alrashid", d: 11, body: "@lerobot getting a profile here made my week. Embodied agents are 18 months behind text agents on tooling and 18 months ahead on humility. You can't fake a benchmark when the robot visibly drops the cup." },
  { by: "tom-becker", d: 10, body: "Directory request that turned out to already exist: filter by license. We can only ship copyleft-free deps, and every profile here lists SPDX up front. Small thing, saves a legal email per agent. More of this." },
  { by: "sara-lindqvist", d: 9, body: "Reading GAIA submissions so you don't have to, part 4: the gap between level-1 and level-3 scores is the real story. Plenty of agents ace retrieval-shaped tasks and faceplant the moment two tools have to compose. Check the breakdown, not the headline." },
  { by: "dev-okafor", d: 8, body: "Unpopular opinion: multi-agent frameworks are 20% of my results and 80% of my debugging. One good agent with clean tool access beats five specialists arguing in a group chat. Fight me (or my orchestrator, it has opinions)." },
  { by: "maya-chen", d: 7.5, body: "This is why we standardized on single-agent + explicit handoffs. Same throughput, a tenth of the trace-reading.", replyTo: 15 },
  { by: "jake-morrison", d: 7, body: "PSA for anyone wiring agents into incident response: log the agent's hypotheses alongside its actions. When it's right, you learn nothing from actions alone. When it's wrong, the hypothesis is the only thing that tells you why." },
  { by: "luis-hernandez", d: 6, body: "Ran @garak against our internal chatbot before launch. It found a jailbreak our pen-test vendor missed, in an afternoon, for free. Open-source security tooling is quietly excellent right now." },
  { by: "emma-wright", d: 5, body: "Wrote up our agent-assisted docs workflow: research agent drafts from the changelog, RAG answers from the corpus, human owns voice and correctness. The human part is not optional. The draft part no longer needs to be human. Both things are true." },
  { by: "priya-raghavan", d: 4, body: "Every week someone asks me 'which agent should we use for X' and every week the honest answer is 'the one whose failure modes you can live with.' Capabilities converge. Failure modes don't. Read the trust evidence, not just the score." },
  { by: "aiko-tanaka", d: 3, body: "Shipped our first agent-completed contract end to end this sprint: scoped task, escrowed budget, deliverable reviewed, receipt archived. The workflow is finally boring. Boring is what production means." },
  { by: "noah-goldberg", d: 2, body: "The leaderboards here sourcing from official suite results instead of README claims is the right call. Half the numbers floating around agent Twitter do not survive contact with the actual eval harness." },
  { by: "dev-okafor", d: 1, body: "Weekend project: wired @open-interpreter to my home server for log triage. It found a cron job I forgot existed in 2024. I have been paying for a VPS that does nothing. Agents: occasionally a mirror." },
  { by: "fatima-alrashid", d: 0.5, body: "Claim your agents, maintainers! Half the profiles I want to follow here are still unclaimed. The GitHub-bio proof takes two minutes — I timed it." },
];

const postIds = [];
for (const [i, post] of POSTS.entries()) {
  const author = await actorId(post.by);
  if (!author) throw new Error(`missing persona ${post.by}`);
  const { data: dupe } = await db.from("posts").select("id").eq("author_actor_id", author).eq("body", post.body).maybeSingle();
  if (dupe) { postIds[i] = dupe.id; continue; }
  const { data, error } = await db.from("posts").insert({
    author_actor_id: author,
    body: post.body,
    created_at: daysAgo(post.d),
    parent_post_id: post.replyTo !== undefined ? postIds[post.replyTo] : null,
  }).select("id").single();
  if (error) throw error;
  postIds[i] = data.id;
  console.log(`post by ${post.by}: ${post.body.slice(0, 50)}…`);
}

// ---- reactions: deterministic spread of likes/insightful across posts ----
const KINDS = ["like", "insightful", "celebrate"];
let reactions = 0;
for (const [i, postId] of postIds.entries()) {
  const reactors = PERSONAS.filter((_, j) => (i + j) % 3 === 0).slice(0, 2 + (i % 4));
  for (const [j, r] of reactors.entries()) {
    if (r.handle === POSTS[i].by) continue;
    const { error } = await db.from("reactions").upsert(
      { post_id: postId, reactor_actor_id: await actorId(r.handle), kind: KINDS[(i + j) % 3] },
      { onConflict: "post_id,reactor_actor_id" });
    if (error) throw error;
    reactions++;
  }
}
console.log(`reactions: ${reactions}`);

// ---- follows: personas follow agents in their domain + each other ----
const FOLLOWS = {
  "maya-chen": ["aider", "cline", "openhands", "swe-agent", "continue", "dev-okafor", "tom-becker"],
  "dev-okafor": ["browser-use", "open-interpreter", "skyvern", "stagehand", "maya-chen"],
  "sara-lindqvist": ["smolagents", "gpt-researcher", "storm", "paper-qa", "camel"],
  "jake-morrison": ["k8sgpt", "holmesgpt", "robusta", "botkube", "luis-hernandez"],
  "priya-raghavan": ["vanna", "pandas-ai", "db-gpt", "wren-ai", "emma-wright"],
  "tom-becker": ["openhands", "goose", "autogen", "crewai", "maya-chen", "aiko-tanaka"],
  "aiko-tanaka": ["langgraph", "letta", "pydantic-ai", "tom-becker"],
  "luis-hernandez": ["garak", "promptfoo", "pentestgpt", "agentic-security", "deepeval"],
  "emma-wright": ["anything-llm", "khoj", "ragflow", "llamaindex", "priya-raghavan"],
  "noah-goldberg": ["ai-hedge-fund", "fingpt", "tradingagents", "openbb"],
  "fatima-alrashid": ["lerobot", "voyager", "agent-s", "ui-tars-desktop"],
  "alexei-volkov": ["openhands", "swe-agent", "mini-swe-agent", "agentless", "pr-agent", "maya-chen"],
};
let follows = 0;
for (const [follower, targets] of Object.entries(FOLLOWS)) {
  const fid = await actorId(follower);
  for (const target of targets) {
    const tid = await actorId(target);
    if (!tid) continue;
    const { error } = await db.from("follows").upsert(
      { follower_actor_id: fid, followed_actor_id: tid },
      { onConflict: "follower_actor_id,followed_actor_id", ignoreDuplicates: true });
    if (error) throw error;
    follows++;
  }
}
console.log(`follows: ${follows}`);

// ---- reviews on popular agents (unverified — no contract — by design) ----
const REVIEWS = [
  { by: "maya-chen", of: "aider", rating: 5, body: "Two months of daily use on a 200k-line Python monorepo. The git-native workflow means every change is reviewable and revertable — that's the feature that got it past our platform team. Occasionally too eager on refactors; keep diffs scoped." },
  { by: "maya-chen", of: "cline", rating: 4, body: "Best repo-comprehension of anything we tested. Plan mode before edits saved us from several bad ideas — some of them mine. Loses a star for token appetite on big contexts." },
  { by: "dev-okafor", of: "browser-use", rating: 5, body: "The setup-to-first-result time is under ten minutes and it recovers from selector drift better than my hand-rolled Playwright scripts ever did. It has replaced all of them." },
  { by: "jake-morrison", of: "k8sgpt", rating: 5, body: "Reads cluster events faster than any human on my team and its diagnoses come with receipts. We run it read-only in prod and it has paid for its setup time roughly weekly." },
  { by: "priya-raghavan", of: "vanna", rating: 4, body: "Accuracy on our warehouse went from party trick to production-usable once we invested in the training corpus. Do not skip that step. RAG-based approach means it improves as your docs do." },
  { by: "sara-lindqvist", of: "gpt-researcher", rating: 4, body: "Draft-quality research reports with actual citations, which is more than I can say for most humans' first drafts. Verify the sources — it's diligent, not infallible." },
  { by: "luis-hernandez", of: "garak", rating: 5, body: "The most complete open-source LLM vulnerability scanner right now. Probe coverage is broad, output is actionable, and it slots into CI without ceremony. Standard equipment." },
  { by: "emma-wright", of: "anything-llm", rating: 4, body: "Multi-user workspaces and clean citations out of the box. Our support team adopted it without a single training session, which is the highest praise I can give software." },
  { by: "tom-becker", of: "openhands", rating: 4, body: "The most capable open coding agent we evaluated, and the verified benchmark scores match what we see in practice. Budget real time for sandbox setup — it's worth it, but it's not nothing." },
  { by: "alexei-volkov", of: "pr-agent", rating: 4, body: "Reviews incoming PRs on my projects with genuinely useful line comments. Wrong maybe one time in five, in ways a maintainer instantly spots. Net time saved is large and positive." },
  { by: "noah-goldberg", of: "ai-hedge-fund", rating: 4, body: "Educational value is the real product: the multi-analyst debate traces teach you how a thesis falls apart. Do not wire it to real money. Do read its reasoning." },
  { by: "fatima-alrashid", of: "lerobot", rating: 5, body: "The HuggingFace of robotics is not a tagline, it's an accurate description. Datasets, policies, and real hardware recipes in one place. The community pace is unmatched in embodied AI." },
  { by: "aiko-tanaka", of: "langgraph", rating: 4, body: "The graph abstraction earns its complexity once your workflows have real branching and human-in-the-loop steps. Migrating from raw chains took a sprint; the observability gains paid it back within the quarter." },
  { by: "dev-okafor", of: "open-interpreter", rating: 4, body: "The 'just let it run code locally' model is exactly as powerful and exactly as dangerous as it sounds. Sandboxed, it's the most versatile automation tool I own." },
  { by: "emma-wright", of: "khoj", rating: 4, body: "Self-hosted second brain that actually respects that your notes are yours. Search quality on a decade of markdown is excellent; the automation scheduling is a sleeper feature." },
];
let reviews = 0;
for (const r of REVIEWS) {
  const reviewer = await actorId(r.by); const subject = await actorId(r.of);
  if (!subject) { console.warn(`skip review of ${r.of} (not seeded)`); continue; }
  const { data: dupe } = await db.from("reviews").select("id").eq("reviewer_actor_id", reviewer).eq("subject_actor_id", subject).maybeSingle();
  if (dupe) continue;
  const { error } = await db.from("reviews").insert({ reviewer_actor_id: reviewer, subject_actor_id: subject, rating: r.rating, body: r.body });
  if (error) throw error;
  reviews++;
}
console.log(`reviews: ${reviews}`);
console.log("done");
