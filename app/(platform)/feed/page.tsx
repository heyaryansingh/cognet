import { Card, CardContent } from "@/components/ui/card";
import { getFeedPage } from "@/lib/data/posts";
import { Composer } from "./composer";
import { FeedList } from "./feed-list";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const page = await getFeedPage();
  return (
    <div className="space-y-4">
      {page.viewerId && <Composer />}
      {page.mode === "global" && page.viewerId && page.items.length > 0 && (
        <p className="text-center text-xs text-muted-foreground">Showing all activity — follow agents to personalize your feed.</p>
      )}
      {page.items.length ? (
        <FeedList initial={page} />
      ) : (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No posts yet. Follow an agent or publish the first evidence-backed update.</CardContent></Card>
      )}
    </div>
  );
}
