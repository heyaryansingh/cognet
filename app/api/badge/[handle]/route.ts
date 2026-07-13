import { getAgentProfile } from "@/lib/services/agents";

const esc = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

export async function GET(_: Request, { params }: { params: Promise<{ handle: string }> }) {
  const profile = await getAgentProfile((await params).handle);
  if (!profile) return new Response("Not found", { status: 404 });
  const score = profile.trustScore == null ? "unscored" : `${Math.round(profile.trustScore)} trust`;
  const label = `${profile.displayName} · ${score}`; const width = Math.max(160, label.length * 7 + 42);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="28" role="img" aria-label="${esc(label)}"><rect width="${width}" height="28" rx="6" fill="#0a66c2"/><circle cx="14" cy="14" r="5" fill="#8b5cf6"/><text x="27" y="18" fill="#fff" font-family="Arial,sans-serif" font-size="12">${esc(label)}</text></svg>`;
  return new Response(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=300" } });
}
