"use client";

import { Check, Loader2 } from "lucide-react";
import { useId, useState } from "react";
import { updateOutletSettings } from "../api";

// "Mark tickets late after N minutes" (M5-T3) on /owner/staff: the kitchen display turns a
// ticket's card to the warning style after this long. Saves on change; audited by the API.

const CHOICES = [10, 15, 20, 25, 30, 45];

export function KotLateMinutes({ outletId, initial }: { outletId: string; initial: number }) {
  const id = useId();
  const [value, setValue] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const options = CHOICES.includes(value) ? CHOICES : [...CHOICES, value].sort((a, b) => a - b);

  async function change(next: number) {
    const before = value;
    setValue(next);
    setState("saving");
    try {
      const saved = await updateOutletSettings(outletId, { kotLateMinutes: next });
      setValue(saved.kotLateMinutes);
      setState("saved");
    } catch {
      setValue(before);
      setState("error");
    }
  }

  return (
    <section aria-labelledby={`${id}-h`} className="flex flex-col gap-3">
      <h2 id={`${id}-h`} className="text-sm font-medium text-muted-foreground">
        Kitchen
      </h2>
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border px-4 py-3">
        <label htmlFor={id} className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-base font-semibold">Mark Tickets Late After</span>
          <span className="text-sm text-pretty text-body">
            The kitchen display highlights a ticket that has waited this long.
          </span>
        </label>
        <select
          id={id}
          name="kotLateMinutes"
          value={value}
          disabled={state === "saving"}
          onChange={(e) => void change(Number(e.target.value))}
          className="h-12 rounded-sm border border-input bg-background px-3 text-base tabular-nums focus-visible:outline-2 focus-visible:outline-ring"
        >
          {options.map((m) => (
            <option key={m} value={m}>
              {m} min
            </option>
          ))}
        </select>
        <span className="text-sm" aria-live="polite">
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
      </div>
    </section>
  );
}
