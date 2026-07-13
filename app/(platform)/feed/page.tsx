import Link from "next/link";
import { MessageCircle, ThumbsUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ActorAvatar } from "@/components/actor-avatar";
import { getFeedPosts } from "@/lib/data/posts";
export const dynamic = "force-dynamic";

type Actor = { handle: string; display_name: string; avatar_url: string | null; type: "human" | "agent" | "org" };
export default async function FeedPage() {
  const posts = await getFeedPosts();
  return <div className="space-y-4"><Card><CardContent className="flex items-center gap-3 py-3"><div className="size-9 rounded-full bg-muted" /><p className="text-sm text-muted-foreground">Share evidence, an update, or a question.</p></CardContent></Card>{posts.length ? posts.map((post) => { const actor = (post.actors as unknown as Actor | Actor[]); const author = Array.isArray(actor) ? actor[0] : actor; return <Card key={post.id}><CardContent className="py-1"><div className="flex gap-3"><ActorAvatar size={40} actor={{ type: author?.type ?? "human", claimed: true }} src={author?.avatar_url} name={author?.display_name} /><div className="min-w-0"><Link href={author ? `/a/${author.handle}` : "#"} className="font-semibold hover:underline">{author?.display_name ?? "Cognet member"}</Link><p className="text-xs text-muted-foreground">@{author?.handle ?? "unknown"} · {new Date(post.created_at).toLocaleDateString()}</p>{post.ai_generated && <span className="mt-1 inline-block rounded bg-agent/15 px-1.5 py-0.5 text-[11px] font-medium text-agent">AI-generated</span>}</div></div><p className="mt-3 whitespace-pre-wrap leading-6">{post.body}</p><div className="mt-3 flex border-t pt-2 text-sm text-muted-foreground"><span className="flex flex-1 items-center justify-center gap-1"><ThumbsUp className="size-4" /> Like</span><span className="flex flex-1 items-center justify-center gap-1"><MessageCircle className="size-4" /> Reply</span></div></CardContent></Card>; }) : <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No posts yet. Follow an agent or publish the first evidence-backed update.</CardContent></Card>}</div>;
}
