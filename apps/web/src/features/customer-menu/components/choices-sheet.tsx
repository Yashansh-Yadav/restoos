"use client";

import { formatINR, selectionError, type PublicMenu } from "@restoos/shared";
import { Minus, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { MAX_QTY, unitPrice, type Draft } from "../cart";
import { displayName, type MenuItem } from "../filter";

// Size + add-ons + quantity for one dish on the guest menu (M5-T6b). The Add button stays off
// until the choice is valid (same rules the API applies: a size when there are sizes, each
// add-on group within its min/max).

type Menu = PublicMenu["menu"];

export function ChoicesSheet({
  item,
  menu,
  onAdd,
}: {
  item: MenuItem;
  menu: Menu;
  onAdd: (draft: Draft) => void;
}) {
  const t = useTranslations("customer.order");
  const locale = useLocale();
  const name = displayName(item, locale);
  const groups = menu.addOnGroups.filter((g) => item.addOnGroupIds.includes(g.id));
  const [variantId, setVariantId] = useState<string | null>(
    item.variants.length === 1 ? (item.variants[0]?.id ?? null) : null,
  );
  const [addOnIds, setAddOnIds] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);

  const draft: Draft = { itemId: item.id, variantId, addOnIds, quantity };
  const valid =
    selectionError(
      { name: item.name, variants: item.variants, addOnGroupIds: item.addOnGroupIds },
      groups,
      draft,
    ) === null;
  const total = unitPrice(item, menu, draft) * quantity;

  function toggleAddOn(groupId: string, addOnId: string, max: number) {
    setAddOnIds((prev) => {
      if (prev.includes(addOnId)) return prev.filter((id) => id !== addOnId);
      const group = groups.find((g) => g.id === groupId);
      const inGroup = prev.filter((id) => group?.addOns.some((a) => a.id === id));
      // A single-choice group swaps; others stop at their max.
      if (max === 1) return [...prev.filter((id) => !inGroup.includes(id)), addOnId];
      return inGroup.length >= max ? prev : [...prev, addOnId];
    });
  }

  return (
    <SheetContent title={t("chooseFor", { name })} closeLabel={t("close")}>
      <div className="flex flex-col gap-5 pt-2">
        {item.variants.length > 0 ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 flex w-full items-baseline justify-between text-base font-semibold">
              {t("size")}
              <span className="text-sm font-normal text-muted-foreground">{t("required")}</span>
            </legend>
            {item.variants.map((v) => (
              <label
                key={v.id}
                className={cn(
                  "flex min-h-touch cursor-pointer items-center gap-3 rounded-md border px-4 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
                  variantId === v.id ? "border-foreground" : "border-border",
                )}
              >
                <input
                  type="radio"
                  name="size"
                  checked={variantId === v.id}
                  onChange={() => setVariantId(v.id)}
                  className="size-5 accent-foreground"
                />
                <span className="flex-1 text-base" translate="no">
                  {v.name}
                </span>
                <span className="text-base tabular-nums">
                  {formatINR(v.price, { paise: "auto" })}
                </span>
              </label>
            ))}
          </fieldset>
        ) : null}

        {groups.map((g) => (
          <fieldset key={g.id} className="flex flex-col gap-2">
            <legend className="mb-2 flex w-full items-baseline justify-between text-base font-semibold">
              <span translate="no">{g.name}</span>
              <span className="text-sm font-normal text-muted-foreground">
                {g.minSelect > 0 ? t("atLeast", { min: g.minSelect }) : t("optional")}
                {g.maxSelect > 1 ? ` · ${t("upTo", { max: g.maxSelect })}` : ""}
              </span>
            </legend>
            {g.addOns.map((a) => {
              const on = addOnIds.includes(a.id);
              return (
                <label
                  key={a.id}
                  className={cn(
                    "flex min-h-touch cursor-pointer items-center gap-3 rounded-md border px-4 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
                    on ? "border-foreground" : "border-border",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleAddOn(g.id, a.id, g.maxSelect)}
                    className="size-5 accent-foreground"
                  />
                  <span className="flex-1 text-base" translate="no">
                    {a.name}
                  </span>
                  <span className="text-base tabular-nums">
                    + {formatINR(a.price, { paise: "auto" })}
                  </span>
                </label>
              );
            })}
          </fieldset>
        ))}

        <div className="flex items-center justify-between gap-3">
          <span id="qty-label" className="text-base font-semibold">
            {t("quantity")}
          </span>
          <div role="group" aria-labelledby="qty-label" className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="icon"
              aria-label={t("oneLess", { name })}
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
              aria-label={t("oneMore", { name })}
              disabled={quantity >= MAX_QTY}
              onClick={() => setQuantity((q) => q + 1)}
            >
              <Plus aria-hidden="true" />
            </Button>
          </div>
        </div>

        <Button className="h-12 text-base" disabled={!valid} onClick={() => onAdd(draft)}>
          {t("addToOrder", { price: formatINR(total, { paise: "auto" }) })}
        </Button>
      </div>
    </SheetContent>
  );
}
