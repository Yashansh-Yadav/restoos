"use client";

import type { StockList } from "@restoos/shared";
import { Search } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { DietMarker } from "@/features/menu/components/diet-marker";
import { cn } from "@/lib/utils";
import { useOutletSocket } from "@/features/realtime/use-outlet-socket";
import { getStock, setStock } from "../api";

// Item Stock (M2-T4): one tap marks a dish out of stock (or back). Optimistic — the switch flips
// at once and rolls back with a message if the save fails. Big targets for busy kitchens.
// English for now (staff Hindi is phase 2, plan §16).

type Filter = "all" | "out";

const stockKey = ["stock", "device"] as const;

export function StockBoard({ initial }: { initial: StockList }) {
  const client = useQueryClient();
  // Live (M4-T3): another device's toggle refreshes this list within a second or two.
  useOutletSocket();
  const { data } = useQuery({
    queryKey: stockKey,
    queryFn: () => getStock(),
    initialData: initial,
  });
  const stock = useMemo<Record<string, boolean>>(
    () => Object.fromEntries(data.categories.flatMap((c) => c.items.map((i) => [i.id, i.inStock]))),
    [data],
  );
  const [failed, setFailed] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const outCount = Object.values(stock).filter((v) => !v).length;
  const q = query.trim().toLowerCase();
  const sections = useMemo(
    () =>
      data.categories
        .map((c) => ({
          ...c,
          items: c.items.filter(
            (i) =>
              (filter === "all" || !stock[i.id]) &&
              (q === "" || i.name.toLowerCase().includes(q) || (i.nameHi ?? "").includes(q)),
          ),
        }))
        .filter((c) => c.items.length > 0),
    [data, stock, filter, q],
  );

  async function toggle(id: string) {
    const next = !stock[id];
    setFailed(null);
    const flip = (inStock: boolean) =>
      client.setQueryData<StockList>(stockKey, (prev) =>
        prev
          ? {
              ...prev,
              categories: prev.categories.map((c) => ({
                ...c,
                items: c.items.map((i) => (i.id === id ? { ...i, inStock } : i)),
              })),
            }
          : prev,
      );
    flip(next);
    try {
      await setStock(id, next);
    } catch {
      flip(!next);
      setFailed(id);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-[28px] leading-tight font-bold">Item Stock</h1>
        <p className="text-base text-body tabular-nums" aria-live="polite">
          {outCount === 0
            ? "Everything is available."
            : `${outCount} ${outCount === 1 ? "item is" : "items are"} out of stock.`}
        </p>
      </div>

      <div className="sticky top-0 z-10 -mx-4 flex flex-col gap-2 bg-background px-4 py-2 sm:-mx-6 sm:px-6">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            name="q"
            aria-label="Search items"
            autoComplete="off"
            placeholder="Search dishes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-12 w-full rounded-full border border-input bg-background pr-4 pl-11 text-base outline-none focus-visible:border-2 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
          />
        </div>
        <div role="group" aria-label="Show" className="flex gap-2">
          {(
            [
              ["all", "All"],
              ["out", `Out of Stock (${outCount})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
              className={cn(
                "inline-flex min-h-touch [touch-action:manipulation] items-center rounded-full border px-4 text-sm font-semibold tabular-nums transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                filter === key
                  ? "border-foreground bg-foreground text-background"
                  : "border-border hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {sections.length === 0 ? (
        <p className="rounded-md bg-muted px-4 py-6 text-center text-base text-body">
          {data.categories.length === 0
            ? "No dishes on the menu yet."
            : filter === "out"
              ? "Nothing is out of stock."
              : "No dish matches that search."}
        </p>
      ) : (
        sections.map((c) => (
          <section key={c.id} aria-labelledby={`cat-${c.id}`} className="flex flex-col gap-2">
            <h2 id={`cat-${c.id}`} className="text-sm font-semibold text-muted-foreground">
              {c.name}
            </h2>
            <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
              {c.items.map((item) => {
                const available = stock[item.id] ?? true;
                return (
                  <li key={item.id} className="flex flex-col gap-1 px-4 py-2">
                    <div className="flex items-center gap-3">
                      <DietMarker diet={item.dietType} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span
                          className={cn(
                            "truncate text-base font-semibold",
                            !available && "text-muted-foreground line-through",
                          )}
                        >
                          {item.name}
                        </span>
                        {item.nameHi ? (
                          <span className="truncate text-sm text-muted-foreground" lang="hi">
                            {item.nameHi}
                          </span>
                        ) : null}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={available}
                        aria-label={`${item.name}: ${available ? "available" : "out of stock"}`}
                        onClick={() => void toggle(item.id)}
                        className={cn(
                          "inline-flex h-touch-staff min-w-36 shrink-0 [touch-action:manipulation] items-center justify-center rounded-full border-2 px-4 text-sm font-bold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none",
                          available
                            ? "border-success bg-success/10 text-success"
                            : "border-destructive bg-destructive text-destructive-foreground",
                        )}
                      >
                        {available ? "Available" : "Out of Stock"}
                      </button>
                    </div>
                    {failed === item.id ? (
                      <p role="alert" className="text-sm font-medium text-destructive">
                        Couldn&apos;t save — check the internet and tap again.
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
