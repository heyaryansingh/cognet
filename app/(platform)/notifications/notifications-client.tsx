"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { markNotificationsReadAction } from "./actions";

type Notification = { id: string; type: string; read_at: string | null; created_at: string };
const label = (t: string) => t.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase());

export function NotificationsClient({ initial }: { initial: Notification[] }) {
  const [items, setItems] = useState(initial);
  const [pending, startTransition] = useTransition();
  const unread = items.filter((n) => !n.read_at).map((n) => n.id);

  const markRead = (ids: string[]) => {
    if (ids.length === 0) return;
    const now = new Date().toISOString();
    setItems((cur) => cur.map((n) => (ids.includes(n.id) ? { ...n, read_at: n.read_at ?? now } : n))); // optimistic
    startTransition(() => { void markNotificationsReadAction(ids); });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <Button variant="outline" size="sm" disabled={pending || unread.length === 0} onClick={() => markRead(unread)}>
          Mark all read{unread.length ? ` (${unread.length})` : ""}
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">You&rsquo;re all caught up.</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {items.map((n) => {
            const isUnread = !n.read_at;
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => isUnread && markRead([n.id])}
                  className={`flex w-full items-start gap-3 px-5 py-4 text-left ${isUnread ? "bg-primary/5" : ""}`}
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${isUnread ? "bg-primary" : "bg-transparent"}`} aria-hidden />
                  <span className="min-w-0">
                    <span className={`block text-sm ${isUnread ? "font-semibold" : "font-medium"}`}>{label(n.type)}</span>
                    <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">{new Date(n.created_at).toLocaleString()}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
