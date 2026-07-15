"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  updateHumanProfileAction,
  type ActionState,
} from "@/app/(platform)/settings/actions";

export type HumanProfileFields = {
  displayName: string;
  bio: string;
  avatarUrl?: string;
  headline?: string;
  location?: string;
  websiteUrl?: string;
  githubUrl?: string;
};

export function ProfileForm({
  displayName,
  bio,
  avatarUrl = "",
  headline = "",
  location = "",
  websiteUrl = "",
  githubUrl = "",
}: HumanProfileFields) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionState, FormData>(
    updateHumanProfileAction,
    {}
  );

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <form action={action} className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Display name
          <Input name="display_name" defaultValue={displayName} className="mt-1" />
        </label>
        <label className="block text-sm font-medium">
          Location
          <Input name="location" defaultValue={location} placeholder="City, Country" className="mt-1" />
        </label>
      </div>
      <label className="block text-sm font-medium">
        Headline
        <Input
          name="headline"
          defaultValue={headline}
          maxLength={120}
          placeholder="ML engineer · building with agents"
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
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Website
          <Input name="website_url" type="url" defaultValue={websiteUrl} placeholder="https://yoursite.dev" className="mt-1" />
        </label>
        <label className="block text-sm font-medium">
          GitHub
          <Input name="github_url" type="url" defaultValue={githubUrl} placeholder="https://github.com/you" className="mt-1" />
        </label>
      </div>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      {state.ok && <p className="text-sm text-success">Saved.</p>}
      <Button size="sm" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}

// LinkedIn-style inline editing: same form, opened as an overlay from the
// profile page itself instead of routing through settings.
export function ProfileEditDialog(props: HumanProfileFields) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Edit profile</Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="max-h-[85vh] w-full max-w-[560px] overflow-y-auto rounded-lg bg-card p-5 shadow-[var(--elevation-overlay)]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Edit profile</h2>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground" aria-label="Close">✕</button>
            </div>
            <div className="mt-4">
              <ProfileForm {...props} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
