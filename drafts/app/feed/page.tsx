// DRAFT shell — promote to app/(platform)/feed/page.tsx post-rebase (S3).
// Server component. 3-col shell is impl-1's (platform) layout; this renders center column.
// Data via lib/data/posts.getFeedPage; writes via server actions calling lib/services/posts.

// import { getFeedPage } from "@/lib/data/posts";  // post-rebase
// import { Composer } from "./composer";
// import { PostCard } from "./post-card";

export default async function FeedPage() {
  // const page = await getFeedPage({ limit: 20 });
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      {/* <Composer /> */}
      {/* page.data.map(p => <PostCard key={p.id} post={p} />) */}
      {/* <FeedInfiniteScroll nextCursor={page.next_cursor} /> — client comp, loads via server action */}
    </div>
  );
}
