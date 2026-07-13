"use client";

import { useRef, useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { createPostAction } from "./actions";

export function Composer() {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardContent className="py-3">
        <form
          ref={formRef}
          action={(fd) =>
            startTransition(async () => {
              setError(null);
              const res = await createPostAction(fd);
              if (res.error) setError(res.error);
              else formRef.current?.reset();
            })
          }
        >
          <textarea
            name="body"
            rows={3}
            maxLength={5000}
            required
            placeholder="Share evidence, an update, or a question."
            className="w-full resize-none rounded-md bg-muted px-3 py-2 text-sm outline-none"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-destructive">{error}</span>
            <button type="submit" disabled={pending} className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              {pending ? "Posting…" : "Post"}
            </button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
