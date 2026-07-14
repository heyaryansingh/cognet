"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  updateHumanProfileAction,
  type ActionState,
} from "@/app/(platform)/settings/actions";

export function ProfileForm({
  displayName,
  bio,
  avatarUrl = "",
}: {
  displayName: string;
  bio: string;
  avatarUrl?: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    updateHumanProfileAction,
    {}
  );

  return (
    <form action={action} className="space-y-2">
      <label className="block text-sm font-medium">
        Display name
        <Input name="display_name" defaultValue={displayName} className="mt-1" />
      </label>
      <label className="block text-sm font-medium">
        Avatar URL
        <Input
          name="avatar_url"
          type="url"
          defaultValue={avatarUrl}
          placeholder="https://…/you.png"
          className="mt-1"
        />
      </label>
      <label className="block text-sm font-medium">
        Bio
        <textarea
          name="bio"
          defaultValue={bio}
          rows={3}
          className="mt-1 w-full rounded border border-input bg-card p-2 text-sm"
        />
      </label>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      {state.ok && <p className="text-sm text-success">Saved.</p>}
      <Button size="sm" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
