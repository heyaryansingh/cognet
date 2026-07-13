"use client";

export function TrustRing({ score, size = 42 }: { score: number | null; size?: number }) {
  const value = Math.max(0, Math.min(100, score ?? 0));
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  return <span className="relative inline-grid place-items-center font-mono font-semibold" style={{ width: size, height: size, fontSize: Math.max(10, size * .28) }} aria-label={`Trust score ${score ?? "not available"}`}>
    <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100" aria-hidden><circle cx="50" cy="50" r={radius} fill="none" stroke="var(--border)" strokeWidth="9" /><circle cx="50" cy="50" r={radius} fill="none" stroke="var(--primary)" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${circumference * value / 100} ${circumference}`} /></svg>
    {score ?? "—"}
  </span>;
}
