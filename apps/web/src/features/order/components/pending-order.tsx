"use client";

import { formatINR, orderTotals, REJECT_REASONS, type PendingOrder } from "@restoos/shared";
import { Check, Loader2, Smartphone, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { approveOrder, rejectOrder } from "../api";
import { orderError } from "../hooks";

// A guest's order from the QR menu, waiting on this table (M5-T6b). One tap "Approve & Send"
// sends it to the kitchen (KOT) exactly like a staff send; "Not Now" turns it down with an
// optional one-tap reason the guest sees. 2 taps from the floor: table → Approve & Send.

export function PendingOrderCard({
  order,
  pricing,
  onDone,
}: {
  order: PendingOrder;
  pricing: { pricesIncludeTax: boolean };
  onDone: (message: { kind: "ok" | "error"; text: string }) => void;
}) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const totals = orderTotals(
    order.lines.map((l) => ({
      unitPrice: l.unitPrice,
      quantity: l.quantity,
      taxRateBps: l.taxRateBps,
    })),
    pricing,
  );

  async function approve() {
    setBusy("approve");
    try {
      const done = await approveOrder(order.id);
      onDone({
        kind: "ok",
        text: done.kot ? `Guest order sent — KOT #${done.kot.number}` : "Guest order approved",
      });
    } catch (err) {
      onDone({ kind: "error", text: orderError(err) });
    } finally {
      setBusy(null);
    }
  }

  async function reject(reason?: string) {
    setBusy("reject");
    try {
      await rejectOrder(order.id, reason ? { reason } : {});
      onDone({ kind: "ok", text: "Guest order turned down" });
    } catch (err) {
      onDone({ kind: "error", text: orderError(err) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <article
      aria-label="Guest order waiting for approval"
      className="flex flex-col gap-3 rounded-md border-2 border-warning bg-warning/10 p-4"
    >
      <div className="flex items-center gap-2">
        <Smartphone className="size-5 shrink-0" aria-hidden="true" />
        <h2 className="text-lg font-bold">Guest Order — Waiting</h2>
        <span className="ml-auto text-base font-semibold tabular-nums">
          {formatINR(totals.total)}
        </span>
      </div>
      <ul className="flex flex-col gap-1">
        {order.lines.map((l) => (
          <li key={l.id} className="text-base leading-snug">
            <span className="font-bold tabular-nums">{l.quantity} ×</span> {l.name}
            {l.addOns.length > 0 ? (
              <span className="text-sm text-muted-foreground"> + {l.addOns.join(", ")}</span>
            ) : null}
            {l.note ? (
              <span className="block text-sm text-muted-foreground italic">“{l.note}”</span>
            ) : null}
          </li>
        ))}
      </ul>
      {rejecting ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Tell the guest why (optional):</p>
          <div className="flex flex-wrap gap-2">
            {REJECT_REASONS.map((r) => (
              <Button
                key={r}
                variant="secondary"
                size="sm"
                disabled={busy !== null}
                onClick={() => void reject(r)}
              >
                {r}
              </Button>
            ))}
            <Button
              variant="secondary"
              size="sm"
              disabled={busy !== null}
              onClick={() => void reject()}
            >
              No Reason
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setRejecting(false)}>
              Back
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            size="staff"
            className="flex-1"
            disabled={busy !== null}
            onClick={() => void approve()}
          >
            {busy === "approve" ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Check aria-hidden="true" />
            )}
            {busy === "approve" ? "Sending…" : "Approve & Send"}
          </Button>
          <Button
            size="staff"
            variant="secondary"
            className="sm:shrink-0"
            disabled={busy !== null}
            onClick={() => setRejecting(true)}
          >
            <X aria-hidden="true" />
            Not Now
          </Button>
        </div>
      )}
    </article>
  );
}
