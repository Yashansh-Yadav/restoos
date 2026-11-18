"use client";

import { formatINR, type SentLine } from "@restoos/shared";
import { Loader2, Minus, Plus, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SheetContent } from "@/components/ui/sheet";
import type { CartLine } from "./order-screen";

// The table's order (M5-T1): new items with − / + steppers and Options, what's already been
// sent, and the running total with GST (same maths as the bill).

type Row = { line: CartLine; name: string; addOns: string[]; unitPrice: number };

export function CartSheet({
  lines,
  sent,
  totals,
  pricesIncludeTax,
  onQuantity,
  onOptions,
  sending,
  onSend,
}: {
  lines: Row[];
  sent: SentLine[];
  totals: { subtotal: number; tax: number; total: number };
  pricesIncludeTax: boolean;
  onQuantity: (key: string, quantity: number) => void;
  onOptions: (line: CartLine) => void;
  sending: boolean;
  onSend: () => void;
}) {
  return (
    <SheetContent title="Order">
      <div className="flex flex-col gap-6 pt-2">
        <section aria-labelledby="new-heading" className="flex flex-col gap-2">
          <h3 id="new-heading" className="text-sm font-medium text-muted-foreground">
            New — not sent yet
          </h3>
          {lines.length === 0 ? (
            <p className="text-base text-muted-foreground">Tap dishes to add them.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
              {lines.map(({ line, name, addOns, unitPrice }) => (
                <li key={line.key} className="flex flex-col gap-2 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col">
                      <span className="text-base font-semibold">{name}</span>
                      {addOns.length > 0 ? (
                        <span className="text-sm text-muted-foreground">+ {addOns.join(", ")}</span>
                      ) : null}
                      {line.note ? (
                        <span className="text-sm text-muted-foreground italic">“{line.note}”</span>
                      ) : null}
                    </div>
                    <span className="text-base tabular-nums">
                      {formatINR(unitPrice * line.quantity)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <Button variant="ghost" size="sm" onClick={() => onOptions(line)}>
                      <SlidersHorizontal aria-hidden="true" />
                      Options
                    </Button>
                    <div
                      role="group"
                      aria-label={`How many ${name}`}
                      className="flex items-center gap-2"
                    >
                      <Button
                        variant="secondary"
                        size="icon"
                        aria-label={line.quantity === 1 ? `Remove ${name}` : `One less ${name}`}
                        onClick={() => onQuantity(line.key, line.quantity - 1)}
                      >
                        <Minus aria-hidden="true" />
                      </Button>
                      <span className="w-8 text-center text-lg font-bold tabular-nums">
                        {line.quantity}
                      </span>
                      <Button
                        variant="secondary"
                        size="icon"
                        aria-label={`One more ${name}`}
                        disabled={line.quantity >= 99}
                        onClick={() => onQuantity(line.key, line.quantity + 1)}
                      >
                        <Plus aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {sent.length > 0 ? (
          <section aria-labelledby="sent-heading" className="flex flex-col gap-2">
            <h3 id="sent-heading" className="text-sm font-medium text-muted-foreground">
              Already sent
            </h3>
            <ul className="flex flex-col gap-1.5">
              {sent.map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-3 text-base">
                  <span className="min-w-0">
                    <span className="tabular-nums">{l.quantity} × </span>
                    {l.name}
                    {l.addOns.length > 0 ? (
                      <span className="text-sm text-muted-foreground">
                        {" "}
                        + {l.addOns.join(", ")}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {formatINR(l.unitPrice * l.quantity)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-t border-border pt-4 text-base tabular-nums">
          <dt className="text-muted-foreground">Items</dt>
          <dd className="text-right">{formatINR(totals.subtotal)}</dd>
          <dt className="text-muted-foreground">GST{pricesIncludeTax ? " (included)" : ""}</dt>
          <dd className="text-right">{formatINR(totals.tax)}</dd>
          <dt className="text-lg font-bold">Table Total</dt>
          <dd className="text-right text-lg font-bold">{formatINR(totals.total)}</dd>
        </dl>

        <Button size="staff" disabled={lines.length === 0 || sending} onClick={onSend}>
          {sending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {sending ? "Sending…" : "Send to Kitchen"}
        </Button>
      </div>
    </SheetContent>
  );
}
