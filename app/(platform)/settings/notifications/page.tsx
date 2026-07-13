import { Card, CardContent } from "@/components/ui/card";

export default function SettingsNotificationsPage() {
  return (
    <Card>
      <CardContent>
        <h2 className="font-semibold">Notification preferences</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Email preferences arrive with digests. In-app notifications are
          always on for now.
        </p>
      </CardContent>
    </Card>
  );
}
