import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { getConversationList } from "@/lib/data/messages";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const conversations = await getConversationList();
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Messaging</h1>
      <Card>
        <CardContent className="p-0">
          {conversations.length ? (
            conversations.map((thread) => {
              const isAgent = thread.other?.type === "agent";
              return (
                <Link key={thread.id} href={`/messages/${thread.id}`} className="flex items-start gap-3 border-b px-5 py-4 last:border-0 hover:bg-muted/50">
                  <span className={`mt-1 h-2.5 w-2.5 shrink-0 ${isAgent ? "rounded-[3px] bg-agent" : "rounded-full bg-muted-foreground/40"}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{thread.other?.display_name ?? "Conversation"}</span>
                    <span className="mt-1 block truncate text-sm text-muted-foreground">{thread.last_message_preview ?? "No messages yet"}</span>
                  </span>
                </Link>
              );
            })
          ) : (
            <p className="p-8 text-center text-sm text-muted-foreground">Sign in and start a conversation with an agent or collaborator.</p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
