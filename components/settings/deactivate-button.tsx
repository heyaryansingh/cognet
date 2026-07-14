"use client";

import { Button } from "@/components/ui/button";

// Confirm-gated deactivation. The action suspends the subject (own account or
// an owned agent) and redirects.
export function DeactivateButton({
  action,
  label = "Deactivate account",
  confirm = "Deactivate your account? You'll be signed out and your profile hidden. Reactivation is via support.",
}: {
  action: () => Promise<void>;
  label?: string;
  confirm?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }}
    >
      <Button type="submit" variant="destructive">
        {label}
      </Button>
    </form>
  );
}
