"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ThreadParticipant } from "@/lib/data/messages";
import { sendMessageAction } from "./actions";

type Message = { id: string; conversation_id: string; sender_actor_id: string; body: string; created_at: string; edited_at: string | null };

// Realtime DM thread. Subscribes to postgres_changes on messages (RLS-scoped: the
// browser client only receives rows this participant may SELECT), so a peer's message
// appears without refresh (acceptance criterion 1). Own sends echo back via the same
// channel; dedupe by id.
export function ThreadClient({ conversationId, myActorId, participants, initialMessages }: {
  conversationId: string;
  myActorId: string;
  participants: Record<string, ThreadParticipant>;
  initialMessages: Message[];
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [state, formAction, pending] = useActionState(sendMessageAction.bind(null, conversationId), { error: null, ok: false });
  const formRef = useRef<HTMLFormElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | undefined;
    let cancelled = false;

    // postgres_changes enforces RLS (messages msg_select is participant-only), so the Realtime
    // socket MUST carry the user's JWT or it receives zero rows and the thread never updates live.
    // getSession() races the cookie-hydrated session (can resolve null first), so authenticate off
    // onAuthStateChange — it fires with the loaded INITIAL_SESSION — and only then open the channel.
    const open = (token: string) => {
      if (cancelled || channel) return; // subscribe once, after setAuth
      supabase.realtime.setAuth(token);
      channel = supabase
        .channel(`messages:${conversationId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
          (payload) => { const row = payload.new as Message; setMessages((cur) => (cur.some((m) => m.id === row.id) ? cur : [...cur, row])); })
        .subscribe();
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.access_token) open(session.access_token);
    });
    // fallback in case the listener registered after the initial event fired
    void supabase.auth.getSession().then(({ data: { session } }) => { if (session?.access_token) open(session.access_token); });

    return () => { cancelled = true; subscription.unsubscribe(); if (channel) void supabase.removeChannel(channel); };
  }, [conversationId, setMessages]);

  useEffect(() => { if (state.ok) formRef.current?.reset(); }, [state.ok]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  return (
    <div className="flex flex-col gap-3">
      <div className="space-y-2">
        {messages.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No messages yet. Say hello.</p>}
        {messages.map((m) => {
          const mine = m.sender_actor_id === myActorId;
          const isAgent = participants[m.sender_actor_id]?.type === "agent";
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={[
                "max-w-[82%] rounded-lg px-3 py-2 text-sm",
                mine ? "bg-primary text-primary-foreground" : "bg-muted",
                // agent-identity accent (never decorative): tint + ring for agent-authored bubbles
                !mine && isAgent ? "bg-agent/10 ring-1 ring-agent/30" : "",
              ].join(" ")}>
                {!mine && (
                  <p className="mb-0.5 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                    <span className={`inline-block h-2 w-2 ${isAgent ? "rounded-[2px] bg-agent" : "rounded-full bg-muted-foreground/50"}`} aria-hidden />
                    {participants[m.sender_actor_id]?.display_name ?? "Unknown"}
                  </p>
                )}
                <p className="whitespace-pre-wrap">{m.body}</p>
                <time className="mt-1 block text-[11px] tabular-nums opacity-70">{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form ref={formRef} action={formAction} className="flex items-center gap-2 border-t pt-3">
        <Input name="body" placeholder="Write a message…" autoComplete="off" maxLength={8000} required className="flex-1" />
        <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Send"}</Button>
      </form>
      {state.error && <p className="text-xs text-[var(--danger,#dc2626)]">{state.error}</p>}
    </div>
  );
}
