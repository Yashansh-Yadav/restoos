"use client";

import { formatINR, type PublicMenu } from "@restoos/shared";
import { Loader2, Minus, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { SheetContent } from "@/components/ui/sheet";
import { cartSummary, itemIndex, unitPrice, type CartLine } from "../cart";
import { displayName } from "../filter";

// The guest's order before it's placed (M5-T6b): lines with steppers, the items total (GST is
// worked out on the bill — the guest page doesn't carry tax rates), and Place Order.

type Menu = PublicMenu["menu"];

export function GuestCartSheet({
  lines,
  menu,
  pricesIncludeTax,
  approval,
  placing,
  error,
  onQuantity,
  onPlace,
}: {
  lines: CartLine[];
  menu: Menu;
  pricesIncludeTax: boolean;
  approval: boolean;
  placing: boolean;
  error: string | null;
  onQuantity: (key: string, quantity: number) => void;
  onPlace: () => void;
}) {
  const t = useTranslations("customer.order");
  const locale = useLocale();
  const items = itemIndex(menu);
  const summary = cartSummary(lines, menu);
  const addOnName = new Map(menu.addOnGroups.flatMap((g) => g.addOns.map((a) => [a.id, a.name])));

  return (
    <SheetContent title={t("yourOrder")} closeLabel={t("close")}>
      <div className="flex flex-col gap-4 pt-2">
        <ul className="flex flex-col divide-y divide-border">
          {lines.map((l) => {
            const item = items.get(l.itemId);
            if (!item?.inStock) return null;
            const name = displayName(item, locale);
            const size = item.variants.find((v) => v.id === l.variantId)?.name;
            const addOns = l.addOnIds.flatMap((id) => addOnName.get(id) ?? []);
            return (
              <li key={l.key} className="flex items-center gap-3 py-3">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-base font-semibold" translate="no">
                    {name}
                    {size ? ` (${size})` : ""}
                  </span>
                  {addOns.length > 0 ? (
                    <span className="text-sm text-muted-foreground" translate="no">
                      + {addOns.join(", ")}
                    </span>
                  ) : null}
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {formatINR(unitPrice(item, menu, l) * l.quantity, { paise: "auto" })}
                  </span>
                </div>
                <div role="group" aria-label={name} className="flex items-center gap-1">
                  <Button
                    variant="secondary"
                    size="icon"
                    aria-label={t("oneLess", { name })}
                    onClick={() => onQuantity(l.key, l.quantity - 1)}
                  >
                    <Minus aria-hidden="true" />
                  </Button>
                  <span className="w-7 text-center text-base font-bold tabular-nums">
                    {l.quantity}
                  </span>
                  <Button
                    variant="secondary"
                    size="icon"
                    aria-label={t("oneMore", { name })}
                    onClick={() => onQuantity(l.key, l.quantity + 1)}
                  >
                    <Plus aria-hidden="true" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>

        {summary.unavailable.length > 0 ? (
          <p className="text-sm text-muted-foreground">{t("dropped")}</p>
        ) : null}

        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-t border-border pt-3 text-base">
          <dt className="font-semibold">{t("itemsTotal")}</dt>
          <dd className="text-right font-semibold tabular-nums">
            {formatINR(summary.subtotal, { paise: "auto" })}
          </dd>
          <dt className="col-span-2 text-sm text-muted-foreground">
            {pricesIncludeTax ? t("gstIncluded") : t("gstOnBill")}
          </dt>
        </dl>

        {approval ? <p className="text-sm text-muted-foreground">{t("approvalNote")}</p> : null}
        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}

        <Button
          className="h-12 text-base"
          disabled={summary.count === 0 || placing}
          onClick={onPlace}
        >
          {placing ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {placing ? t("placing") : t("placeOrder")}
        </Button>
      </div>
    </SheetContent>
  );
}
