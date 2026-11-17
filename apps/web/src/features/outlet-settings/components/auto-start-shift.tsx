"use client";

import { Check, Loader2 } from "lucide-react";
import { useId, useState } from "react";
import { updateOutletSettings } from "../api";

// "Start shifts automatically" (M1-T7) on /owner/staff. Saves on change; the switch rolls back
// if the save fails. Changes are audited by the API.

export function AutoStartShift({ outletId, initial }: { outletId: string; initial: boolean }) {
  const id = useId();
  const [on, setOn] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function change(next: boolean) {
    setOn(next);
    setState("saving");
    try {
      const saved = await updateOutletSettings(outletId, { autoStartShift: next });
      setOn(saved.autoStartShift);
      setState("saved");
    } catch {
      setOn(!next);
      setState("error");
    }
  }

  return (
    <section aria-labelledby={`${id}-h`} className="flex flex-col gap-3">
      <h2 id={`${id}-h`} className="text-sm font-medium text-muted-foreground">
        Shifts
      </h2>
      <label
        htmlFor={id}
        className="flex min-h-touch cursor-pointer items-start gap-3 rounded-md border border-border px-4 py-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring"
      >
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={on}
          disabled={state === "saving"}
          onChange={(e) => void change(e.target.checked)}
          className="mt-0.5 size-5 shrink-0 accent-foreground"
        />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-base font-semibold">Start Shifts Automatically</span>
          <span className="text-sm text-pretty text-body">
            A shift starts when someone first signs in each day. Turn off to have staff tap
            &ldquo;Start Shift&rdquo; themselves.
          </span>
        </span>
        <span className="shrink-0 pt-0.5 text-sm" aria-live="polite">
          {state === "saving" ? (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              <span className="sr-only">Saving…</span>
            </span>
          ) : state === "saved" ? (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Check className="size-4" aria-hidden="true" />
              Saved
            </span>
          ) : state === "error" ? (
            <span className="font-medium text-destructive">Not saved. Try again.</span>
          ) : null}
        </span>
      </label>
    </section>
  );
}
