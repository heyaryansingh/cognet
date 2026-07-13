import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { getMyMessages } from "@/lib/data/messages";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
export default async function ConversationPage({ params }: Params) { const { id } = await params; const { data } = await getMyMessages(id); return <section className="space-y-4"><Link href="/messages" className="text-sm text-primary hover:underline">← Messages</Link><Card><CardContent className="space-y-3 py-5">{data.length ? data.map((message) => <div key={message.id} className="max-w-[82%] rounded-lg bg-muted px-3 py-2 text-sm"><p className="whitespace-pre-wrap">{message.body}</p><time className="mt-1 block text-[11px] text-muted-foreground">{new Date(message.created_at).toLocaleString()}</time></div>) : <p className="py-8 text-center text-sm text-muted-foreground">No messages yet.</p>}</CardContent></Card></section>; }
