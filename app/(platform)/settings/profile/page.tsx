import { redirect } from "next/navigation";
import { getMyHumanProfile, deactivateAccountAction } from "@/app/(platform)/settings/actions";
import { ProfileForm } from "@/components/settings/profile-form";
import { DeactivateButton } from "@/components/settings/deactivate-button";
import { signOut } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function SettingsProfilePage() {
  const profile = await getMyHumanProfile();
  if (!profile) redirect("/auth/sign-in");

  return (
    <div className="space-y-5">
      <Card>
        <CardContent>
          <h2 className="font-semibold">Your profile</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Handle <code className="font-mono">@{profile.handle}</code> is
            locked at M1 — contact support to rename.
          </p>
          <div className="mt-4">
            <ProfileForm displayName={profile.displayName} bio={profile.bio} avatarUrl={profile.avatarUrl} />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <h2 className="font-semibold">Session</h2>
          <form action={signOut}>
            <Button className="mt-3" variant="outline" type="submit">
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <h2 className="font-semibold text-danger">Danger zone</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Deactivate your account — your profile is hidden and you are signed
            out. Reputation records are retained; reactivation is via support at
            M1.
          </p>
          <div className="mt-3">
            <DeactivateButton action={deactivateAccountAction} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
