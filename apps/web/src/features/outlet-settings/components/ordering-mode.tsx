"use client";

import type { OrderingMode as Mode } from "@restoos/shared";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import { updateOutletSettings } from "../api";

// "Guest Ordering" (M5-T6b) on /owner/staff: what guests can do from the table QR. Saves on
// choice; rolls back if the save fails (e.g. the plan doesn't include guest ordering — the API
// says so and we show its message). Changes are audited by the API.

const OPTIONS: { value: Mode; title: string; body: string }[] = [
  {
    value: "VIEW_ONLY",
    title: "Menu Only",
    body: "Guests see the menu and prices; staff take every order.",
  },
  {
    value: "SELF_ORDER_APPROVAL",
    title: "Guests Order, Staff Approve",
    body: "Orders wait on the table until a butler taps Approve & Send. Recommended.",
  },
  {
    value: "SELF_ORDER",
    title: "Guests Order Straight to the Kitchen",
    body: "No approval step. Anyone with a photo of the QR code can order — use only when every table is watched.",
  },
];

export function OrderingMode({ outletId, initial }: { outletId: string; initial: Mode }) {
  const id = useId();
  const [mode, setMode] = useState<Mode>(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function choose(next: Mode) {
    if (next === mode) return;
    const before = mode;
    setMode(next);
    setState("saving");
    setError(null);
    try {
      const saved = await updateOutletSettings(outletId, { orderingMode: next });
      setMode(saved.orderingMode);
      setState("saved");
    } catch (err) {
      setMode(before);
      setState("error");
      setError(
        err instanceof Error && "status" in err && err.status === 403
          ? err.message
          : "Not saved. Try again.",
      );
    }
  }

  return (
    <section aria-labelledby={`${id}-h`} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id={`${id}-h`} className="text-sm font-medium text-muted-foreground">
          Guest Ordering from the QR Menu
        </h2>
        <span className="text-sm" aria-live="polite">
          {state === "saving" ? (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Saving…
            </span>
          ) : state === "saved" ? (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Check className="size-4" aria-hidden="true" />
              Saved
            </span>
          ) : null}
        </span>
      </div>
      <div role="radiogroup" aria-labelledby={`${id}-h`} className="flex flex-col gap-2">
        {OPTIONS.map((o) => (
          <label
            key={o.value}
            className={cn(
              "flex min-h-touch cursor-pointer items-start gap-3 rounded-md border px-4 py-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
              mode === o.value ? "border-foreground" : "border-border",
            )}
          >
            <input
              type="radio"
              name={`${id}-mode`}
              value={o.value}
              checked={mode === o.value}
              disabled={state === "saving"}
              onChange={() => void choose(o.value)}
              className="mt-1 size-5 shrink-0 accent-foreground"
            />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-base font-semibold">{o.title}</span>
              <span className="text-sm text-pretty text-body">{o.body}</span>
            </span>
            {o.value === "SELF_ORDER" ? (
              <TriangleAlert className="mt-1 size-5 shrink-0 text-warning" aria-hidden="true" />
            ) : null}
          </label>
        ))}
      </div>
      {state === "error" && error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
