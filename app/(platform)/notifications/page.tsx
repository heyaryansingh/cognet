import { getMyNotifications } from "@/lib/data/messages";
import { NotificationsClient } from "./notifications-client";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const { data } = await getMyNotifications();
  return (
    <section className="space-y-4">
      <NotificationsClient initial={data} />
    </section>
  );
}
