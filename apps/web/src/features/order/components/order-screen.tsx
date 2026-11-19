"use client";

import {
  formatINR,
  lineName,
  needsOptions,
  orderTotals,
  unitPriceOf,
  type OrderPad,
  type PadItem,
  type SentLine,
} from "@restoos/shared";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Loader2, Search, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { DietMarker } from "@/features/menu/components/diet-marker";
import { useOutletSocket } from "@/features/realtime/use-outlet-socket";
import { changeTableStatus } from "@/features/staff-floor/api";
import { STATUS } from "@/features/staff-floor/components/staff-floor";
import { cn } from "@/lib/utils";
import { sendOrder } from "../api";
import { orderError, orderPadKey, useOrderPad } from "../hooks";
import { CartSheet } from "./cart-sheet";
import { OptionsSheet, type Draft } from "./options-sheet";
import { VoidSheet } from "./void-sheet";

// Staff order screen (M5-T1). Click budget: table tap → item taps → "Send to Kitchen".
// A simple item adds one per tap; items with sizes or required add-ons open the options sheet;
// a long-press (or "Options" in the cart) opens it for any item. The running total uses the same
// GST maths as the bill (orderTotals → calculateBill). English for now (staff Hindi: phase 2).

export type CartLine = Draft & { key: string };

const POPULAR = "popular";
const LONG_PRESS_MS = 500;
const sameChoice = (a: Draft, b: Draft) =>
  a.itemId === b.itemId &&
  (a.variantId ?? null) === (b.variantId ?? null) &&
  [...a.addOnIds].sort().join() === [...b.addOnIds].sort().join() &&
  (a.note ?? "") === (b.note ?? "");
const newClientId = () => crypto.randomUUID().replaceAll("-", "");

export function OrderScreen({
  tableId,
  initial,
  canVoid = false,
}: {
  tableId: string;
  initial: OrderPad;
  /** Managers and owners may void sent items (M5-T5); the API checks again. */
  canVoid?: boolean;
}) {
  const client = useQueryClient();
  const { data: pad } = useOrderPad(tableId, initial);
  const { status: live } = useOutletSocket();
  const [tab, setTab] = useState<string>(POPULAR);
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  // One id per cart content: a retry of the same cart can't create a second order (rule 8).
  const clientIdRef = useRef(newClientId());
  const [options, setOptions] = useState<{ draft: Draft; editKey?: string } | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [tableBusy, setTableBusy] = useState(false);
  const [voiding, setVoiding] = useState<SentLine | null>(null);

  const items = useMemo(() => pad.categories.flatMap((c) => c.items), [pad]);
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      return items.filter(
        (i) => i.name.toLowerCase().includes(q) || (i.code ?? "").toLowerCase() === q,
      );
    }
    if (tab === POPULAR) {
      return pad.topItemIds.flatMap((id) => {
        const i = itemById.get(id);
        return i ? [i] : [];
      });
    }
    return pad.categories.find((c) => c.id === tab)?.items ?? [];
  }, [query, tab, items, itemById, pad]);

  const priced = (line: Draft) => {
    const item = itemById.get(line.itemId);
    return item
      ? {
          unitPrice: unitPriceOf(item, pad.addOnGroups, line),
          quantity: line.quantity,
          taxRateBps: item.taxRateBps,
        }
      : null;
  };
  const cartTotals = orderTotals(
    cart.flatMap((l) => {
      const p = priced(l);
      return p ? [p] : [];
    }),
    pad.pricing,
  );
  const tableTotals = orderTotals(
    [
      ...pad.sent
        .filter((l) => l.status !== "VOIDED")
        .map((l) => ({
          unitPrice: l.unitPrice,
          quantity: l.quantity,
          taxRateBps: l.taxRateBps,
        })),
      ...cart.flatMap((l) => {
        const p = priced(l);
        return p ? [p] : [];
      }),
    ],
    pad.pricing,
  );
  const inCart = (itemId: string) =>
    cart.filter((l) => l.itemId === itemId).reduce((n, l) => n + l.quantity, 0);

  function changeCart(next: (prev: CartLine[]) => CartLine[]) {
    setCart(next);
    clientIdRef.current = newClientId();
    setNotice(null);
  }

  function addDraft(draft: Draft, editKey?: string) {
    changeCart((prev) => {
      const rest = editKey ? prev.filter((l) => l.key !== editKey) : prev;
      const same = rest.find((l) => sameChoice(l, draft));
      if (same) {
        return rest.map((l) =>
          l === same ? { ...l, quantity: Math.min(99, l.quantity + draft.quantity) } : l,
        );
      }
      return [...rest, { ...draft, key: crypto.randomUUID() }];
    });
  }

  function tapItem(item: PadItem) {
    if (!item.inStock) return;
    if (needsOptions(item, pad.addOnGroups)) {
      setOptions({ draft: { itemId: item.id, variantId: null, addOnIds: [], quantity: 1 } });
      return;
    }
    addDraft({ itemId: item.id, variantId: null, addOnIds: [], quantity: 1 });
  }

  async function send() {
    if (cart.length === 0 || sending) return;
    setSending(true);
    setNotice(null);
    try {
      const sent = await sendOrder({
        clientId: clientIdRef.current,
        tableId,
        items: cart.map((l) => ({
          itemId: l.itemId,
          variantId: l.variantId ?? null,
          addOnIds: l.addOnIds,
          quantity: l.quantity,
          ...(l.note ? { note: l.note } : {}),
        })),
      });
      setCart([]);
      clientIdRef.current = newClientId();
      setCartOpen(false);
      setNotice({
        kind: "ok",
        text: sent.kot ? `Sent to kitchen — KOT #${sent.kot.number}` : "Sent to kitchen",
      });
    } catch (err) {
      setNotice({ kind: "error", text: orderError(err) });
    } finally {
      setSending(false);
      void client.invalidateQueries({ queryKey: orderPadKey(tableId) });
    }
  }

  async function tableAction(event: "seat" | "unseat") {
    setTableBusy(true);
    try {
      await changeTableStatus(tableId, event);
    } catch (err) {
      setNotice({ kind: "error", text: orderError(err) });
    } finally {
      setTableBusy(false);
      void client.invalidateQueries({ queryKey: orderPadKey(tableId) });
    }
  }

  // Long-press opens the options for any item; the click that follows is swallowed.
  const press = useRef<{ timer: number; fired: boolean } | null>(null);
  const startPress = (item: PadItem) => {
    if (!item.inStock) return;
    const state = { fired: false, timer: 0 };
    state.timer = window.setTimeout(() => {
      state.fired = true;
      setOptions({ draft: { itemId: item.id, variantId: null, addOnIds: [], quantity: 1 } });
    }, LONG_PRESS_MS);
    press.current = state;
  };
  const endPress = () => {
    if (press.current) window.clearTimeout(press.current.timer);
  };

  const { table } = pad;
  const optionsItem = options ? itemById.get(options.draft.itemId) : undefined;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 flex flex-col gap-3 border-b border-border bg-background px-4 pt-3 pb-3 sm:px-6">
        <div className="flex items-center gap-2">
          <Link
            href="/staff/floor"
            className="-ml-2 inline-flex min-h-touch items-center gap-1 rounded-sm px-2 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
            Floor
          </Link>
          <h1 className="text-[28px] leading-none font-bold tabular-nums" translate="no">
            {table.label}
          </h1>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-sm font-semibold",
              STATUS[table.status].pill,
            )}
          >
            {STATUS[table.status].word}
          </span>
          <span className="ml-auto truncate text-sm text-muted-foreground">
            {table.butlerName ?? "No butler"}
            <span className="sr-only">, {live === "live" ? "live" : "reconnecting"}</span>
          </span>
          {table.status === "FREE" || table.status === "OCCUPIED" ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={tableBusy}
              onClick={() => void tableAction(table.status === "FREE" ? "seat" : "unseat")}
            >
              {table.status === "FREE" ? "Seat Only" : "Guests Left"}
            </Button>
          ) : null}
        </div>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            name="q"
            aria-label="Search dishes by name or code"
            autoComplete="off"
            placeholder="Search name or code…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-12 w-full rounded-full border border-input bg-background pr-4 pl-11 text-base outline-none focus-visible:border-2 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
          />
        </div>
        {query.trim() === "" ? (
          <nav aria-label="Menu sections" className="-mx-4 sm:-mx-6">
            <ul className="flex gap-1 overflow-x-auto overscroll-x-contain px-4 sm:px-6">
              {[{ id: POPULAR, name: "Popular" }, ...pad.categories].map((c) => (
                <li key={c.id} className="shrink-0">
                  <button
                    type="button"
                    aria-current={tab === c.id ? "true" : undefined}
                    onClick={() => setTab(c.id)}
                    className={cn(
                      "flex min-h-touch items-center border-b-2 px-3 text-base whitespace-nowrap focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                      tab === c.id
                        ? "border-foreground font-semibold"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </header>

      <main className="flex-1 px-4 pt-4 pb-40 sm:px-6">
        {shown.length === 0 ? (
          <p className="py-10 text-center text-base text-muted-foreground">
            {query ? `Nothing matches "${query}".` : "No dishes here yet."}
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {shown.map((item) => {
              const count = inCart(item.id);
              const from =
                item.variants.length > 0
                  ? Math.min(...item.variants.map((v) => v.price))
                  : item.basePrice;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={!item.inStock}
                    aria-label={`${item.name}${item.code ? `, code ${item.code}` : ""}, ${formatINR(from)}${item.inStock ? "" : ", out of stock"}${count ? `, ${count} in order` : ""}`}
                    onPointerDown={() => startPress(item)}
                    onPointerUp={endPress}
                    onPointerLeave={endPress}
                    onPointerCancel={endPress}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (item.inStock)
                        setOptions({
                          draft: { itemId: item.id, variantId: null, addOnIds: [], quantity: 1 },
                        });
                    }}
                    onClick={() => {
                      if (press.current?.fired) {
                        press.current = null;
                        return;
                      }
                      tapItem(item);
                    }}
                    className={cn(
                      "relative flex min-h-[88px] w-full [touch-action:manipulation] flex-col justify-between gap-1 rounded-md border px-3 py-2.5 text-left select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      count > 0
                        ? "border-2 border-primary bg-primary/5"
                        : "border-border hover:bg-muted active:bg-secondary",
                      !item.inStock && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <span className="flex items-start gap-1.5">
                      <DietMarker diet={item.dietType} decorative className="mt-1 shrink-0" />
                      <span className="line-clamp-2 text-base leading-snug font-semibold">
                        {item.name}
                      </span>
                    </span>
                    <span className="flex items-baseline justify-between gap-2 text-sm text-muted-foreground tabular-nums">
                      <span>
                        {item.variants.length > 0 ? "from " : ""}
                        {formatINR(from)}
                      </span>
                      {item.inStock ? (
                        item.code ? (
                          <span translate="no">#{item.code}</span>
                        ) : null
                      ) : (
                        <span>Out of stock</span>
                      )}
                    </span>
                    {count > 0 ? (
                      <span
                        aria-hidden="true"
                        className="absolute -top-2 -right-2 flex size-7 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground tabular-nums"
                      >
                        {count}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <div
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background px-4 pt-3 sm:px-6"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        {notice ? (
          <p
            role={notice.kind === "error" ? "alert" : "status"}
            className={cn(
              "mb-2 text-sm font-medium",
              notice.kind === "error" ? "text-destructive" : "text-success",
            )}
          >
            {notice.text}
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="flex min-h-touch-staff min-w-0 flex-1 items-center gap-3 rounded-md border border-border px-3 text-left focus-visible:outline-2 focus-visible:outline-ring"
          >
            <ShoppingBag className="size-5 shrink-0" aria-hidden="true" />
            <span className="flex min-w-0 flex-col">
              <span className="text-base font-semibold tabular-nums">
                {cartTotals.count === 0
                  ? "No new items"
                  : `${cartTotals.count} new · ${formatINR(cartTotals.total)}`}
              </span>
              <span className="truncate text-xs text-muted-foreground tabular-nums">
                Table total {formatINR(tableTotals.total)}{" "}
                {pad.pricing.pricesIncludeTax ? "incl." : "with"} GST
              </span>
            </span>
          </button>
          <Button size="staff" disabled={cart.length === 0 || sending} onClick={() => void send()}>
            {sending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {sending ? "Sending…" : "Send to Kitchen"}
          </Button>
        </div>
      </div>

      <Sheet open={options !== null} onOpenChange={(o) => !o && setOptions(null)}>
        {options && optionsItem ? (
          <OptionsSheet
            key={`${options.draft.itemId}-${options.editKey ?? "new"}`}
            item={optionsItem}
            groups={pad.addOnGroups}
            initial={options.draft}
            editing={options.editKey !== undefined}
            onDone={(draft) => {
              addDraft(draft, options.editKey);
              setOptions(null);
            }}
          />
        ) : null}
      </Sheet>

      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        {cartOpen ? (
          <CartSheet
            lines={cart.map((l) => {
              const item = itemById.get(l.itemId);
              return {
                line: l,
                name: item ? lineName(item, l.variantId) : "Removed item",
                addOns: pad.addOnGroups
                  .flatMap((g) => g.addOns)
                  .filter((a) => l.addOnIds.includes(a.id))
                  .map((a) => a.name),
                unitPrice: priced(l)?.unitPrice ?? 0,
              };
            })}
            sent={pad.sent}
            totals={tableTotals}
            pricesIncludeTax={pad.pricing.pricesIncludeTax}
            onQuantity={(key, quantity) =>
              changeCart((prev) =>
                quantity <= 0
                  ? prev.filter((l) => l.key !== key)
                  : prev.map((l) => (l.key === key ? { ...l, quantity } : l)),
              )
            }
            onOptions={(line) => {
              setCartOpen(false);
              setOptions({ draft: line, editKey: line.key });
            }}
            sending={sending}
            onSend={() => void send()}
            {...(canVoid
              ? {
                  onVoid: (line: SentLine) => {
                    setCartOpen(false);
                    setVoiding(line);
                  },
                }
              : {})}
          />
        ) : null}
      </Sheet>

      <Sheet open={voiding !== null} onOpenChange={(o) => !o && setVoiding(null)}>
        {voiding ? (
          <VoidSheet
            key={voiding.id}
            line={voiding}
            onDone={(result) => {
              const line = voiding;
              setVoiding(null);
              setNotice(
                result.ok
                  ? { kind: "ok", text: `Voided ${result.quantity} × ${line.name}` }
                  : { kind: "error", text: result.message },
              );
              void client.invalidateQueries({ queryKey: orderPadKey(tableId) });
            }}
          />
        ) : null}
      </Sheet>
    </div>
  );
}
