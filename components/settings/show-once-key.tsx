"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

// The show-once moment (settings wireframe): the full key exists only in the
// action response held in client memory — never persisted, never in a URL.
// "I've stored it" is required to dismiss; dismissing without copying asks
// for explicit confirmation.
export function ShowOnceKey({
  apiKey,
  scopes,
  note,
  onDismiss,
}: {
  apiKey: string;
  scopes?: string[];
  note?: string;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const dismiss = () => {
    if (!copied && !window.confirm("This key cannot be shown again. Dismiss without copying?")) {
      return;
    }
    onDismiss();
  };

  return (
    <div className="rounded-md border border-warning/40 bg-warning-muted p-4">
      <p className="text-sm font-semibold text-warning">
        Store this key now — it is shown exactly once.
      </p>
      <code className="mt-2 block overflow-x-auto rounded bg-card p-3 font-mono text-xs">
        {apiKey}
      </code>
      {scopes && scopes.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Scopes: {scopes.join(", ")}
        </p>
      )}
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(apiKey);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy key"}
        </Button>
        <Button size="sm" onClick={dismiss}>
          I&apos;ve stored it
        </Button>
      </div>
    </div>
  );
}
