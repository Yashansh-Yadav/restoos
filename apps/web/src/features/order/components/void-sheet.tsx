"use client";

import { formatINR, VOID_REASONS, type SentLine } from "@restoos/shared";
import { Ban, Loader2, Minus, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { voidOrderItem } from "../api";

// Void a sent item (M5-T5): managers and owners only (the API checks order.voidItem). How many
// (only asked when the line has more than one), a one-tap reason or "Other" with text, confirm.
// The kitchen sees it struck through live; the VOID KOT slip prints once printing exists (M6).

const OTHER = "Other";

export function VoidSheet({
  line,
  onDone,
}: {
  line: SentLine;
  onDone: (result: { ok: true; quantity: number } | { ok: false; message: string }) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [choice, setChoice] = useState<string | null>(null);
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reason = choice === OTHER ? other.trim() : (choice ?? "");
  const ready = reason.length > 0 && !busy;

  async function confirm() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await voidOrderItem(line.id, { quantity, fromQuantity: line.quantity, reason });
      onDone({ ok: true, quantity });
    } catch (err) {
      const message =
        err instanceof Error &&
        "status" in err &&
        typeof err.status === "number" &&
        err.status < 500
          ? err.message
          : "Couldn't void. Check the connection and try again.";
      if (err instanceof Error && "status" in err && err.status === 409) {
        onDone({ ok: false, message });
        return;
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SheetContent
      title={`Void ${line.quantity} × ${line.name}`}
      description="Takes it off the table's order. Recorded with your name and the reason."
    >
      <div className="flex flex-col gap-5 pt-2">
        {line.quantity > 1 ? (
          <div className="flex items-center justify-between gap-3">
            <span id="void-qty" className="text-base font-medium">
              How many to void
            </span>
            <div role="group" aria-labelledby="void-qty" className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="icon"
                aria-label="One less"
                disabled={quantity <= 1}
                onClick={() => setQuantity((q) => q - 1)}
              >
                <Minus aria-hidden="true" />
              </Button>
              <span className="w-8 text-center text-lg font-bold tabular-nums" aria-live="polite">
                {quantity}
              </span>
              <Button
                variant="secondary"
                size="icon"
                aria-label="One more"
                disabled={quantity >= line.quantity}
                onClick={() => setQuantity((q) => q + 1)}
              >
                <Plus aria-hidden="true" />
              </Button>
            </div>
          </div>
        ) : null}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-base font-medium">Reason</legend>
          <div className="flex flex-wrap gap-2">
            {[...VOID_REASONS, OTHER].map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={choice === r}
                onClick={() => setChoice(r)}
                className={cn(
                  "min-h-touch [touch-action:manipulation] rounded-full border px-4 text-base font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  choice === r
                    ? "border-foreground bg-foreground text-background"
                    : "border-input bg-background hover:bg-muted",
                )}
              >
                {r === OTHER ? "Other…" : r}
              </button>
            ))}
          </div>
          {choice === OTHER ? (
            <Input
              aria-label="Reason"
              placeholder="e.g. Spilled at the table…"
              maxLength={200}
              autoComplete="off"
              value={other}
              onChange={(e) => setOther(e.target.value)}
              className="mt-1"
            />
          ) : null}
        </fieldset>

        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}

        <Button size="staff" variant="destructive" disabled={!ready} onClick={() => void confirm()}>
          {busy ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Ban aria-hidden="true" />
          )}
          {busy
            ? "Voiding…"
            : `Void ${quantity} ${quantity === 1 ? "Item" : "Items"} · ${formatINR(line.unitPrice * quantity)}`}
        </Button>
      </div>
    </SheetContent>
  );
}
