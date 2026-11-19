"use client";

import type { TableOrders } from "@restoos/shared";
import { Check, Clock, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

// What the guest has ordered this sitting and what happened to it (M5-T6b), live: waiting for
// staff → sent to the kitchen, or not accepted (with the reason staff picked). Icon + words,
// never colour alone. Dish names stay as ordered (snapshots).

const ICON = { WAITING: Clock, SENT: Check, NOT_ACCEPTED: X } as const;

export function YourOrders({ orders }: { orders: TableOrders["orders"] }) {
  const t = useTranslations("customer.order");
  if (orders.length === 0) return null;
  return (
    <section aria-labelledby="your-orders" className="flex flex-col gap-2">
      <h2 id="your-orders" className="text-lg font-bold">
        {t("yourOrders")}
      </h2>
      <ul className="flex flex-col gap-2" aria-live="polite">
        {[...orders].reverse().map((o) => {
          const Icon = ICON[o.state];
          return (
            <li
              key={o.id}
              className={cn(
                "flex flex-col gap-1 rounded-lg border px-4 py-3",
                o.state === "WAITING"
                  ? "border-warning bg-warning/10"
                  : o.state === "SENT"
                    ? "border-success/60 bg-success/5"
                    : "border-border bg-muted/40",
              )}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {t(`state${o.state}`)}
              </span>
              <span
                className={cn("text-base", o.state === "NOT_ACCEPTED" && "line-through")}
                translate="no"
              >
                {o.items.map((i) => `${i.quantity} × ${i.name}`).join(", ")}
              </span>
              {o.reason ? (
                <span className="text-sm text-muted-foreground">
                  {t("reason", { reason: o.reason })}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
