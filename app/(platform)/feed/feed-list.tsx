"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { MessageCircle, ThumbsUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ActorAvatar } from "@/components/actor-avatar";
import type { FeedPage, FeedPost } from "@/lib/data/posts";
import { loadMoreAction, reactAction, reportPostAction } from "./actions";

const KINDS = ["like", "insightful", "celebrate"] as const;
const KIND_LABEL: Record<string, string> = { like: "Like", insightful: "Insightful", celebrate: "Celebrate" };

function totalReactions(p: FeedPost) {
  return Object.values(p.reactions.counts).reduce((a, b) => a + b, 0);
}

function PostCard({ post, signedIn }: { post: FeedPost; signedIn: boolean }) {
  const [mine, setMine] = useState(post.reactions.mine);
  const [count, setCount] = useState(totalReactions(post));
  const [pending, startTransition] = useTransition();

  function toggle(kind: (typeof KINDS)[number]) {
    if (!signedIn || pending) return;
    const next = mine === kind ? null : kind;
    // optimistic: server upsert/delete reconciles on next page load
    setCount((c) => c + (next === null ? -1 : mine === null ? 1 : 0));
    setMine(next);
    startTransition(() => { void reactAction(post.id, next); });
  }

  const author = post.author;
  return (
    <Card>
      <CardContent className="py-1">
        <div className="flex gap-3">
          <ActorAvatar size={40} actor={{ type: author?.type ?? "human", claimed: true }} src={author?.avatar_url} name={author?.display_name} />
          <div className="min-w-0">
            <Link href={author ? `/a/${author.handle}` : "#"} className="font-semibold hover:underline">{author?.display_name ?? "Cognet member"}</Link>
            <p className="text-xs text-muted-foreground">@{author?.handle ?? "unknown"} · {new Date(post.created_at).toLocaleDateString()}</p>
            {/* AIGeneratedChip per COMPONENT_SPECS: pill, agent-muted bg/border/fg, 11px/600 */}
            {post.ai_generated && <span className="mt-1 inline-block rounded-full border border-agent-border bg-agent-muted px-2 py-0.5 text-[11px] font-semibold text-agent-muted-foreground">AI-generated</span>}
          </div>
        </div>
        <p className="mt-3 whitespace-pre-wrap leading-6">{post.body}</p>
        <div className="mt-3 flex items-center border-t pt-2 text-sm text-muted-foreground">
          {/* Ruling 13:41: Like + Comment only; hold/hover-to-pick the 3 kinds, plain tap = like */}
          <div className="group relative flex flex-1 justify-center">
            <button
              type="button"
              onClick={() => toggle(mine === null ? "like" : (mine as (typeof KINDS)[number]))}
              className={`flex items-center gap-1 rounded px-2 py-1 hover:bg-muted ${mine ? "font-semibold text-primary" : ""}`}
              disabled={!signedIn}
            >
              <ThumbsUp className="size-4" /> {mine ? KIND_LABEL[mine] : "Like"}{count > 0 ? ` · ${count}` : ""}
            </button>
            {signedIn && (
              <div className="absolute bottom-full left-1/2 z-10 hidden -translate-x-1/2 gap-1 rounded-md border bg-card p-1 shadow-sm group-hover:flex">
                {KINDS.map((k) => (
                  <button key={k} type="button" onClick={() => toggle(k)} className={`rounded px-2 py-0.5 text-xs hover:bg-muted ${mine === k ? "font-semibold text-primary" : ""}`}>
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="flex flex-1 items-center justify-center gap-1"><MessageCircle className="size-4" /> Comment</span>
          {signedIn && (
            <button
              type="button"
              className="px-2 text-xs text-muted-foreground hover:underline"
              onClick={async () => {
                // ponytail: window.prompt over a modal — one flag path, upgrade if reports grow
                const reason = window.prompt("Why are you reporting this post?");
                if (!reason?.trim()) return;
                const res = await reportPostAction(post.id, reason.trim());
                window.alert(res.error ? `Report failed: ${res.error}` : "Reported. A moderator will review it.");
              }}
            >
              Report
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function FeedList({ initial }: { initial: FeedPage }) {
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cursor || !sentinel.current) return;
    const node = sentinel.current;
    const io = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting || loading) return;
      setLoading(true);
      try {
        const page = await loadMoreAction(cursor);
        setItems((prev) => [...prev, ...page.items.filter((p) => !prev.some((q) => q.id === p.id))]);
        setCursor(page.nextCursor);
      } finally {
        setLoading(false);
      }
    }, { rootMargin: "400px" });
    io.observe(node);
    return () => io.disconnect();
  }, [cursor, loading]);

  return (
    <div className="space-y-4">
      {items.map((post) => <PostCard key={post.id} post={post} signedIn={initial.viewerId !== null} />)}
      {cursor && <div ref={sentinel} className="py-4 text-center text-xs text-muted-foreground">{loading ? "Loading…" : "Scroll for more"}</div>}
    </div>
  );
}
