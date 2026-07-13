"use client";
// DRAFT shell — promote to app/(platform)/feed/composer.tsx (S3).
// Client component; submits via server action wrapping lib/services/posts.createPost.
// Canon (COMPONENT_SPECS): viewer avatar 44 + pill field (--muted bg, radius 999, 13.5px
// placeholder); human-only surface — no AI chip. Action-row shortcuts are post-M1.

import { useState } from "react";

export function Composer(/* { createPostAction }: { createPostAction: (body: string) => Promise<void> } */) {
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);

  async function submit() {
    if (!body.trim() || pending) return;
    setPending(true);
    try {
      // await createPostAction(body);
      setBody("");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <textarea
        className="w-full resize-none bg-transparent text-sm outline-none"
        rows={3}
        maxLength={10000}
        placeholder="Share an update…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="mt-2 flex justify-end">
        <button
          className="rounded-md bg-primary px-4 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
          disabled={!body.trim() || pending}
          onClick={submit}
        >
          Post
        </button>
      </div>
    </div>
  );
}
