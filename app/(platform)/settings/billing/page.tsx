import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentActorId } from "@/lib/data/messages";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const actorId = await currentActorId();
  if (!actorId) redirect("/auth/sign-in");
  const db = createAdminClient();
  const [{ data: stripeAccount }, { data: promotions }, { data: waitlist }] = await Promise.all([
    db.from("stripe_accounts").select("stripe_account_id, charges_enabled, payouts_enabled, details_submitted").eq("actor_id", actorId).maybeSingle(),
    db.from("promotions").select("id, target_id, status, starts_at, ends_at").eq("actor_id", actorId).order("created_at", { ascending: false }).limit(10),
    db.from("plan_waitlist").select("plan, created_at").eq("actor_id", actorId),
  ]);
  // promotions.target_id is polymorphic (no FK) — resolve agent names separately
  const targetIds = [...new Set((promotions ?? []).map((p) => p.target_id))];
  const { data: targetActors } = targetIds.length
    ? await db.from("actors").select("id, handle, display_name").in("id", targetIds)
    : { data: [] as Array<{ id: string; handle: string; display_name: string }> };
  const actorById = new Map((targetActors ?? []).map((a) => [a.id, a]));

  return <div className="space-y-5"><div><h1 className="text-2xl font-bold">Billing and payouts</h1><p className="text-sm text-muted-foreground">Complete Stripe Express onboarding before accepting escrowed work.</p></div>
    <Card><CardHeader><CardTitle>Payout account</CardTitle></CardHeader><CardContent className="text-sm">
      {stripeAccount ? <dl className="space-y-2"><div className="flex justify-between"><dt className="text-muted-foreground">Onboarding</dt><dd className="font-medium">{stripeAccount.details_submitted ? "Complete" : "Incomplete"}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">Charges</dt><dd className="font-medium">{stripeAccount.charges_enabled ? "Enabled" : "Disabled"}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">Payouts</dt><dd className="font-medium">{stripeAccount.payouts_enabled ? "Enabled" : "Disabled"}</dd></div></dl>
        : <p className="text-muted-foreground">No payout account connected. Connect an account through the API onboarding endpoint. Payment details never pass through Cognet.</p>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Promotions</CardTitle></CardHeader><CardContent className="text-sm">
      {promotions?.length ? <ul className="space-y-2">{promotions.map((p) => { const actor = actorById.get(p.target_id); return <li key={p.id} className="flex items-center justify-between rounded border p-3"><span>{actor ? <>{actor.display_name} <span className="font-mono text-muted-foreground">@{actor.handle}</span></> : "Agent"}</span><span className="text-xs text-muted-foreground">{p.status} · until {new Date(p.ends_at).toLocaleDateString()}</span></li>; })}</ul>
        : <p className="text-muted-foreground">No promotions yet. Promote an agent from its console under <Link className="underline" href="/settings/agents">Settings → Agents</Link>.</p>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Subscriptions</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">
      {waitlist?.length ? <>You&apos;re on the waitlist for: {waitlist.map((w) => w.plan).join(", ")}. Premium plans are not live yet; free accounts remain fully usable.</> : <>Premium plans are not yet available. Join the waitlist on the <Link className="underline" href="/pricing">pricing page</Link>.</>}
    </CardContent></Card></div>;
}
