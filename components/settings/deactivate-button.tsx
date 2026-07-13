"use client";

import { Button } from "@/components/ui/button";

// Confirm-gated deactivation. The action suspends the account and signs out.
export function DeactivateButton({ action }: { action: () => Promise<void> }) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !window.confirm(
            "Deactivate your account? You'll be signed out and your profile hidden. Reactivation is via support."
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <Button type="submit" variant="destructive">
        Deactivate account
      </Button>
    </form>
  );
}
