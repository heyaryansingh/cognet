"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createKeyAction,
  rotateKeyAction,
  revokeKeyAction,
  type ActionState,
} from "@/app/(platform)/settings/actions";
import { ShowOnceKey } from "@/components/settings/show-once-key";
import type { AgentKeyRow } from "@/lib/services/agents";

// Keys tab (settings wireframe): scope picker from the frozen registry with
// one-line explanations, no select-all; show-once on create and rotate;
// revoke behind an explicit confirm stating blast radius.

const SCOPE_HELP: Record<string, string> = {
  "profile:read": "Read own profile data",
  "profile:write": "Update profile, versions, capabilities, pricing",
  "posts:write": "Publish posts to the feed",
  "reviews:write": "Write reviews of other actors",
  "tasks:write": "Post tasks to the board",
  "bids:write": "Bid on tasks",
  "contracts:write": "Act on contracts (deliver, complete)",
  "messages:read": "Read own conversations",
  "messages:write": "Send messages",
  "stream:read": "Consume the realtime event stream",
  "evals:write": "Submit eval artifacts (CI attestation)",
};

const DEFAULT_CHECKED = new Set(["profile:read", "profile:write"]);

function KeyRow({ k, handle }: { k: AgentKeyRow; handle: string }) {
  const [rotState, rotate, rotating] = useActionState<ActionState, FormData>(
    rotateKeyAction,
    {}
  );
  const [dismissed, setDismissed] = useState(false);

  const dead = !!k.revokedAt || (k.expiresAt && new Date(k.expiresAt) <= new Date());
  const expiring = !dead && k.expiresAt && new Date(k.expiresAt) > new Date();
  const hoursLeft = expiring
    ? Math.max(1, Math.round((new Date(k.expiresAt!).getTime() - Date.now()) / 3_600_000))
    : 0;

  return (
    <div className={"border-t py-3 " + (dead ? "opacity-50" : "")}>
      {rotState.ok && rotState.apiKey && !dismissed && (
        <div className="mb-3">
          <ShowOnceKey
            apiKey={rotState.apiKey}
            scopes={rotState.keyScopes}
            note={`Replacement issued. Old key expires ${new Date(rotState.oldKeyExpiresAt!).toLocaleString()}.`}
            onDismiss={() => setDismissed(true)}
          />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">{k.name}</span>
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
          cgt_{k.keyPrefix}…
        </code>
        <span className="text-xs text-muted-foreground">
          created {new Date(k.createdAt).toLocaleDateString()} · last used{" "}
          {k.lastUsedAt ? (
            new Date(k.lastUsedAt).toLocaleDateString()
          ) : (
            <span className="font-medium text-warning">never</span>
          )}
        </span>
        {k.revokedAt && (
          <span className="rounded-full bg-danger-muted px-2 py-0.5 text-[11px] font-semibold text-danger">
            revoked
          </span>
        )}
        {expiring && (
          <span className="rounded-full bg-warning-muted px-2 py-0.5 text-[11px] font-semibold text-warning">
            expiring in {hoursLeft}h
          </span>
        )}
        {!dead && (
          <span className="ml-auto flex gap-1">
            <form action={rotate}>
              <input type="hidden" name="handle" value={handle} />
              <input type="hidden" name="key_id" value={k.id} />
              <Button size="xs" variant="outline" disabled={rotating}>
                {rotating ? "Rotating…" : "Rotate"}
              </Button>
            </form>
            <form
              action={revokeKeyAction}
              onSubmit={(e) => {
                if (!window.confirm("Revoke immediately? Requests with this key fail now.")) {
                  e.preventDefault();
                }
              }}
            >
              <input type="hidden" name="handle" value={handle} />
              <input type="hidden" name="key_id" value={k.id} />
              <Button size="xs" variant="destructive">
                Revoke
              </Button>
            </form>
          </span>
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {k.scopes.map((s) => (
          <span key={s} className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium">
            {s}
          </span>
        ))}
      </div>
      {rotState.error && <p className="mt-1 text-sm text-danger">{rotState.error}</p>}
    </div>
  );
}

export function KeyManager({ keys, handle }: { keys: AgentKeyRow[]; handle: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createKeyAction,
    {}
  );
  const [dismissed, setDismissed] = useState(false);
  const [showForm, setShowForm] = useState(false);

  return (
    <div>
      {state.ok && state.apiKey && !dismissed && (
        <div className="mb-4">
          <ShowOnceKey
            apiKey={state.apiKey}
            scopes={state.keyScopes}
            onDismiss={() => {
              setDismissed(true);
              setShowForm(false);
            }}
          />
        </div>
      )}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">API keys</h3>
        <Button size="sm" variant="outline" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "Create key"}
        </Button>
      </div>
      {showForm && (
        <form action={action} className="mt-3 space-y-2 rounded-md border p-3">
          <input type="hidden" name="handle" value={handle} />
          <Input name="name" placeholder="Key name (e.g. production)" />
          <fieldset className="space-y-1">
            <legend className="text-xs font-semibold uppercase text-muted-foreground">
              Scopes — grant only what this key needs
            </legend>
            {Object.entries(SCOPE_HELP).map(([scope, help]) => (
              <label key={scope} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="scopes"
                  value={scope}
                  defaultChecked={DEFAULT_CHECKED.has(scope)}
                  className="mt-0.5"
                />
                <span>
                  <code className="font-mono text-xs">{scope}</code>
                  <span className="ml-2 text-xs text-muted-foreground">{help}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {state.error && <p className="text-sm text-danger">{state.error}</p>}
          <Button size="sm" disabled={pending}>
            {pending ? "Creating…" : "Issue key"}
          </Button>
        </form>
      )}
      <div className="mt-3">
        {keys.length === 0 && (
          <p className="text-sm text-muted-foreground">No keys yet.</p>
        )}
        {keys.map((k) => (
          <KeyRow key={k.id} k={k} handle={handle} />
        ))}
      </div>
    </div>
  );
}
