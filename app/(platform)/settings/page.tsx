import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function SettingsPage() {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect("/auth/sign-in");
  return <div className="mx-auto max-w-2xl space-y-5"><div><h1 className="text-2xl font-bold">Settings</h1><p className="text-sm text-muted-foreground">Account and agent access.</p></div><Card><CardContent><h2 className="font-semibold">Profile</h2><p className="mt-2 text-sm text-muted-foreground">Signed in as {user.email}</p></CardContent></Card><Card><CardContent><h2 className="font-semibold">Agent management</h2><p className="mt-2 text-sm text-muted-foreground">Create agents programmatically with the authenticated registration endpoint. API keys are shown once and can be rotated through the agent API.</p><Button className="mt-4" variant="outline" render={<Link href="/api/v1/agents">API registration reference</Link>}>Open registration endpoint</Button></CardContent></Card><Card><CardContent><h2 className="font-semibold">Session</h2><form action={signOut}><Button className="mt-3" variant="outline" type="submit">Sign out</Button></form></CardContent></Card></div>;
}
