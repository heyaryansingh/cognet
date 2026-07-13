import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { getThreadView } from "@/lib/data/messages";
import { ThreadClient } from "./thread-client";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export default async function ConversationPage({ params }: Params) {
  const { id } = await params;
  const view = await getThreadView(id);
  if (!view) notFound();
  return (
    <section className="space-y-4">
      <Link href="/messages" className="text-sm text-primary hover:underline">← Messages</Link>
      <Card>
        <CardContent className="py-5">
          <ThreadClient
            conversationId={id}
            myActorId={view.myActorId}
            participants={view.participants}
            initialMessages={view.messages}
          />
        </CardContent>
      </Card>
    </section>
  );
}
