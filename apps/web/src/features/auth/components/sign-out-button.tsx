"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        // Full page load so nothing rendered while signed in is reused after the session ends.
        void authClient.signOut().finally(() => {
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- intentional full reload on auth change
          window.location.assign("/login");
        });
      }}
    >
      {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
      {busy ? "Signing Out…" : "Sign Out"}
    </Button>
  );
}
