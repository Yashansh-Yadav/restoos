"use client";

import { formatINR, type MenuItem, type OwnerMenu } from "@restoos/shared";
import { ChevronRight, FolderTree, ListPlus, Plus, UtensilsCrossed } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useMenu } from "../hooks";
import { AddOnGroupsSheet } from "./addon-groups-sheet";
import { CategoriesSheet } from "./categories-sheet";
import { DietMarker } from "./diet-marker";
import { ItemSheet } from "./item-sheet";

// /owner/menu (M2-T1): categories (strip on phones, list on wider screens) → items → edit sheet.
// English for now; owner screens move to the i18n helper when it lands.

type Open =
  { kind: "item"; item: MenuItem | null } | { kind: "categories" } | { kind: "addons" } | null;

/** "₹220" or "from ₹140" when the item has sizes. */
function priceLabel(item: MenuItem): string {
  // Menus show whole rupees without ".00" (bills always show paise).
  if (item.variants.length === 0) return formatINR(item.basePrice, { paise: "auto" });
  return `from ${formatINR(Math.min(...item.variants.map((v) => v.price)), { paise: "auto" })}`;
}

const itemCount = (n: number) => `${n} ${n === 1 ? "item" : "items"}`;

export function MenuManager({ outletId, initial }: { outletId: string; initial: OwnerMenu }) {
  const { data: menu } = useMenu(outletId, initial);
  const [selected, setSelected] = useState<string | undefined>(menu.categories[0]?.id);
  const [open, setOpen] = useState<Open>(null);

  const current = menu.categories.find((c) => c.id === selected) ?? menu.categories[0];
  const items = menu.items.filter((i) => i.categoryId === current?.id);
  const countIn = (id: string) =>
    menu.items.filter((i) => i.categoryId === id && i.isActive).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] leading-tight font-bold">Menu</h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            {itemCount(menu.items.filter((i) => i.isActive).length)} in {menu.categories.length}{" "}
            {menu.categories.length === 1 ? "category" : "categories"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setOpen({ kind: "categories" })}>
            <FolderTree aria-hidden="true" />
            Categories
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setOpen({ kind: "addons" })}>
            <ListPlus aria-hidden="true" />
            Add-ons
          </Button>
          <Button
            size="sm"
            disabled={menu.categories.length === 0}
            onClick={() => setOpen({ kind: "item", item: null })}
          >
            <Plus aria-hidden="true" />
            Add Item
          </Button>
        </div>
      </div>

      {menu.categories.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border px-6 py-12 text-center">
          <UtensilsCrossed className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-base font-semibold">Start with a category</p>
          <p className="max-w-sm text-sm text-pretty text-muted-foreground">
            Group your dishes like on a printed menu — Starters, Mains, Breads, Drinks. Then add
            items to each. Importing a whole menu from Excel is coming soon.
          </p>
          <Button onClick={() => setOpen({ kind: "categories" })}>
            <Plus aria-hidden="true" />
            Add Your First Category
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4 md:grid md:grid-cols-[220px_1fr] md:gap-6">
          {/* Category picker: horizontal strip on phones, list on wider screens. */}
          <nav aria-label="Categories" className="-mx-4 md:mx-0">
            <ul className="flex gap-1 overflow-x-auto overscroll-x-contain px-4 md:flex-col md:overflow-visible md:px-0">
              {menu.categories.map((c) => {
                const active = c.id === current?.id;
                return (
                  <li key={c.id} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => setSelected(c.id)}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "flex min-h-touch w-full items-center justify-between gap-3 px-3 text-left text-base whitespace-nowrap transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                        "border-b-2 md:rounded-sm md:border-b-0",
                        active
                          ? "border-foreground font-semibold text-foreground md:bg-muted"
                          : "border-transparent text-muted-foreground hover:text-foreground md:hover:bg-muted",
                        !c.isActive && "italic",
                      )}
                    >
                      <span className="truncate">{c.name}</span>
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {countIn(c.id)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <section
            aria-label={current ? `${current.name} items` : "Items"}
            className="flex flex-col gap-3"
          >
            {current && !current.isActive ? (
              <p className="rounded-md bg-muted px-4 py-3 text-sm text-body">
                This category is hidden from the menu. Show it again under Categories.
              </p>
            ) : null}
            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border px-6 py-10 text-center">
                <p className="text-base font-semibold">No items in {current?.name} yet</p>
                <Button variant="secondary" onClick={() => setOpen({ kind: "item", item: null })}>
                  <Plus aria-hidden="true" />
                  Add Item
                </Button>
              </div>
            ) : (
              <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setOpen({ kind: "item", item })}
                      className="flex min-h-touch-staff w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                    >
                      <DietMarker diet={item.dietType} className="mt-1 self-start" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span
                          className={cn(
                            "truncate text-base font-semibold",
                            !item.isActive && "text-muted-foreground",
                          )}
                        >
                          {item.name}
                        </span>
                        {item.nameHi ? (
                          <span className="truncate text-sm text-muted-foreground" lang="hi">
                            {item.nameHi}
                          </span>
                        ) : null}
                        {/* Phones: price under the name so the name gets the full width. */}
                        <span className="text-sm font-semibold tabular-nums sm:hidden">
                          {priceLabel(item)}
                        </span>
                      </span>
                      {item.isActive ? null : (
                        <span className="shrink-0 rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                          Hidden
                        </span>
                      )}
                      <span className="hidden shrink-0 text-base font-semibold tabular-nums sm:block">
                        {priceLabel(item)}
                      </span>
                      {item.imageUrl ? (
                        <Image
                          src={item.imageUrl}
                          alt=""
                          width={48}
                          height={48}
                          unoptimized
                          loading="lazy"
                          className="size-12 shrink-0 rounded-md object-cover"
                        />
                      ) : null}
                      <ChevronRight
                        className="hidden size-5 shrink-0 text-muted-foreground sm:block"
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <Sheet open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        {open?.kind === "item" ? (
          <ItemSheet
            key={open.item?.id ?? "new"}
            outletId={outletId}
            menu={menu}
            item={open.item}
            categoryId={current?.id}
            onClose={() => setOpen(null)}
          />
        ) : open?.kind === "categories" ? (
          <CategoriesSheet
            outletId={outletId}
            categories={menu.categories}
            onClose={() => setOpen(null)}
          />
        ) : open?.kind === "addons" ? (
          <AddOnGroupsSheet
            outletId={outletId}
            groups={menu.addOnGroups}
            onClose={() => setOpen(null)}
          />
        ) : null}
      </Sheet>
    </div>
  );
}
