// Regenerates data/public-agent-profiles.json from data/public-agent-seed-list.json.
// Enriches each curated repo via the GitHub API (gh CLI, authenticated). Drops entries
// that are dead, archived, or not under an OSI-approved license, and logs why.
// Deterministic: output is a pure function of the seed list + current GitHub state.
import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

const OSI_LICENSES = new Set([
  "MIT", "Apache-2.0", "GPL-2.0", "GPL-3.0", "GPL-2.0-only", "GPL-3.0-only",
  "GPL-2.0-or-later", "GPL-3.0-or-later", "BSD-2-Clause", "BSD-3-Clause",
  "MPL-2.0", "LGPL-2.1", "LGPL-3.0", "LGPL-2.1-only", "LGPL-3.0-only",
  "AGPL-3.0", "AGPL-3.0-only", "AGPL-3.0-or-later", "ISC", "Unlicense", "EPL-2.0", "0BSD",
]);

const CATEGORY_LABELS = {
  coding: "coding agent",
  browser: "browser automation agent",
  research: "research agent",
  "multi-agent": "multi-agent framework",
  voice: "voice agent",
  rag: "RAG knowledge agent",
  data: "data analysis agent",
  devops: "DevOps agent",
  automation: "automation agent",
  security: "security and evaluation agent",
};

const DISCLAIMER =
  "This is an unclaimed Cognet profile imported from the upstream open-source project, not a maintainer-operated account.";
const CHANGELOG =
  "Imported from the public GitHub project. Evidence and benchmark claims remain upstream-authored until independently verified.";

async function gh(path, attempt = 1) {
  try {
    const { stdout } = await exec("gh", ["api", path], { maxBuffer: 10 * 1024 * 1024 });
    return JSON.parse(stdout);
  } catch (err) {
    if (/HTTP 404/.test(String(err.stderr ?? err.message))) return null;
    if (attempt < 4) {
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      return gh(path, attempt + 1);
    }
    throw err;
  }
}

function cleanReadme(base64) {
  let text = Buffer.from(base64, "base64").toString("utf8");
  text = text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")                      // html tags
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")          // images/badges
    .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")       // links -> text
    .replace(/^#{1,6}\s.*$/gm, "")                  // headings
    .replace(/```[\s\S]*?```/g, "")                 // code blocks
    .replace(/^\s*[|:-]{3,}.*$/gm, "")              // table rules
    .replace(/[*_`>#]/g, "")
    .replace(/\r/g, "");
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) =>
      p.length > 60 &&
      !/^\s*(license|table of contents|citation)/i.test(p) &&
      !/^https?:\/\/\S+$/.test(p) &&
      !p.includes("user-attachments") &&
      !/^\d+\.\s/.test(p));
  let out = "";
  for (const p of paragraphs) {
    if (out.length + p.length > 1200) break;
    out += (out ? "\n\n" : "") + p;
  }
  return out;
}

function buildTagline(entry, repo) {
  const label = CATEGORY_LABELS[entry.category];
  let tagline = (entry.tagline ?? repo.description ?? "").trim();
  if (tagline.length > 160) tagline = tagline.slice(0, 157).trimEnd() + "…";
  const hasTerm = tagline.toLowerCase().includes(entry.category.replace("-", " ")) ||
    tagline.toLowerCase().includes(entry.category) ||
    tagline.toLowerCase().includes(label);
  if (!tagline) return `Open-source ${label}.`;
  if (!hasTerm) tagline = `${tagline.replace(/[.…]?$/, "")} — open-source ${label}.`;
  return tagline;
}

const seed = JSON.parse(await readFile(new URL("../data/public-agent-seed-list.json", import.meta.url), "utf8"));
const profiles = [];
const dropped = [];
const seenHandles = new Set();
const seenRepos = new Set();

for (const entry of seed.entries) {
  if (seenHandles.has(entry.handle)) throw new Error(`duplicate handle in seed list: ${entry.handle}`);
  seenHandles.add(entry.handle);
  const repoKey = entry.repo.toLowerCase();
  if (seenRepos.has(repoKey)) throw new Error(`duplicate repo in seed list: ${entry.repo}`);
  seenRepos.add(repoKey);

  const repo = await gh(`repos/${entry.repo}`);
  if (!repo) { dropped.push(`${entry.repo} — 404 / gone`); continue; }
  if (repo.archived) { dropped.push(`${entry.repo} — archived`); continue; }
  const spdx = repo.license?.spdx_id ?? "NONE";
  if (!OSI_LICENSES.has(spdx)) { dropped.push(`${entry.repo} — license ${spdx} not in OSI allowlist`); continue; }

  const readme = await gh(`repos/${repo.full_name}/readme`);
  const excerpt = readme?.content ? cleanReadme(readme.content) : "";
  const owner = repo.full_name.split("/")[0];
  const label = CATEGORY_LABELS[entry.category];

  const capabilities = {
    primary: label.charAt(0).toUpperCase() + label.slice(1),
    category: entry.category,
    github_stars: repo.stargazers_count,
    language: repo.language ?? undefined,
    topics: repo.topics?.length ? repo.topics.slice(0, 8).join(", ") : undefined,
  };
  Object.keys(capabilities).forEach((k) => capabilities[k] === undefined && delete capabilities[k]);

  const endpoints = {
    repository: repo.html_url,
    documentation: repo.homepage?.trim() ? repo.homepage.trim() : `${repo.html_url}#readme`,
  };
  if (entry.huggingface) endpoints.huggingface = entry.huggingface;

  profiles.push({
    handle: entry.handle,
    displayName: entry.displayName ?? repo.name,
    tagline: buildTagline(entry, repo),
    description: excerpt ? `${excerpt}\n\n${DISCLAIMER}` : `${repo.description ?? ""}\n\n${DISCLAIMER}`.trim(),
    avatarUrl: `https://github.com/${owner}.png`,
    sourceUrl: repo.html_url,
    capabilities,
    pricing: { license: spdx, availability: "Free and open source", note: "Model and infrastructure providers may charge separately." },
    endpoints,
    benchmarksSelfReported: (entry.benchmarks ?? []).map((b) => ({ ...b, status: "self-reported" })),
    changelog: CHANGELOG,
  });
  console.log(`ok   ${entry.handle} (${repo.full_name}, ★${repo.stargazers_count}, ${spdx})`);
}

for (const s of seed.static) {
  if (seenHandles.has(s.handle)) throw new Error(`duplicate handle in static list: ${s.handle}`);
  seenHandles.add(s.handle);
  profiles.push(s);
  console.log(`ok   ${s.handle} (static)`);
}

await writeFile(new URL("../data/public-agent-profiles.json", import.meta.url), JSON.stringify(profiles, null, 2) + "\n");
console.log(`\nwrote ${profiles.length} profiles; dropped ${dropped.length}:`);
for (const d of dropped) console.log(`drop ${d}`);
if (profiles.length < 100) console.warn(`WARNING: only ${profiles.length} profiles — add seed entries to reach 100.`);
