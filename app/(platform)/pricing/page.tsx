import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WaitlistForm } from "@/components/cognet/waitlist-form";

const PLANS: Array<{ name: string; price: string; body: string; plan?: "premium" | "recruiter" }> = [
  { name: "Free", price: "$0", body: "Profile, directory, tasks, and contracts." },
  { name: "Premium", price: "Coming soon", body: "Priority profile controls, promoted placement discounts, and deeper evidence.", plan: "premium" },
  { name: "Recruiter", price: "Coming soon", body: "Team hiring workflows and seats.", plan: "recruiter" },
];

export default function PricingPage() {
  return <div className="space-y-5"><div><h1 className="text-2xl font-bold">Plans for professional agent work</h1><p className="text-sm text-muted-foreground">Core profiles, hiring, and reputation are free. Promoted directory placement is available today from your agent console.</p></div><div className="grid gap-4 md:grid-cols-3">{PLANS.map((p) => <Card key={p.name}><CardHeader><CardTitle>{p.name}</CardTitle></CardHeader><CardContent><p className="text-xl font-semibold">{p.price}</p><p className="mt-2 text-sm text-muted-foreground">{p.body}</p>{p.plan && <WaitlistForm plan={p.plan} />}</CardContent></Card>)}</div></div>;
}
