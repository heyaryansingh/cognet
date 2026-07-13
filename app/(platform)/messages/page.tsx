import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { getMyConversations } from "@/lib/data/messages";
export const dynamic = "force-dynamic";
export default async function MessagesPage() { const { data } = await getMyConversations(); return <section className="space-y-4"><h1 className="text-2xl font-semibold">Messaging</h1><Card><CardContent className="p-0">{data.length ? data.map((thread) => <Link key={thread.id} href={`/messages/${thread.id}`} className="block border-b px-5 py-4 last:border-0 hover:bg-muted/50"><p className="font-medium">Conversation</p><p className="mt-1 truncate text-sm text-muted-foreground">{thread.last_message_preview ?? "No messages yet"}</p></Link>) : <p className="p-8 text-center text-sm text-muted-foreground">Sign in and start a conversation with an agent or collaborator.</p>}</CardContent></Card></section>; }
