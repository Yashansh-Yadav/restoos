"use client";

import { formatINR, type PublicMenu } from "@restoos/shared";
import { useQueryClient } from "@tanstack/react-query";
import { ShoppingBag } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Sheet } from "@/components/ui/sheet";
import { ApiError } from "@/lib/api";
import { placeGuestOrder } from "../api";
import {
  addToCart,
  cartSummary,
  countOf,
  itemIndex,
  loadCart,
  saveCart,
  setQuantity,
  type CartLine,
  type Draft,
} from "../cart";
import type { MenuItem } from "../filter";
import { tableOrdersKey } from "../hooks";
import { ChoicesSheet } from "./choices-sheet";
import { GuestCartSheet } from "./guest-cart-sheet";

// Guest ordering state for the QR menu (M5-T6b): the cart (kept in sessionStorage per table),
// Add / steppers on dishes, the choices sheet, the sticky order bar and Place Order. One
// clientId per cart content, so a retry after a network error can't order twice (rule 8).

const newClientId = () => crypto.randomUUID().replaceAll("-", "");
const subscribeNoop = () => () => undefined;

export type GuestOrdering = ReturnType<typeof useGuestOrdering>;

export function useGuestOrdering(qrToken: string, data: PublicMenu) {
  const t = useTranslations("customer.order");
  const client = useQueryClient();
  const enabled = data.outlet.orderingMode !== "VIEW_ONLY";
  // The cart lives in this browser only: render it after hydration (server HTML has none).
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
  const [cart, setCart] = useState<CartLine[]>(() =>
    typeof window === "undefined" ? [] : loadCart(qrToken),
  );
  useEffect(() => saveCart(qrToken, cart), [qrToken, cart]);
  const clientIdRef = useRef(newClientId());
  const [choosing, setChoosing] = useState<MenuItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const lines = useMemo(() => (mounted && enabled ? cart : []), [mounted, enabled, cart]);
  const summary = useMemo(() => cartSummary(lines, data.menu), [lines, data.menu]);

  function change(next: (prev: CartLine[]) => CartLine[]) {
    setCart(next);
    clientIdRef.current = newClientId();
    setError(null);
  }
  const add = (draft: Draft) => change((prev) => addToCart(prev, draft, crypto.randomUUID()));

  /** A dish with sizes or add-ons opens the choices sheet; a plain one adds one. */
  const hasChoices = (item: MenuItem) => item.variants.length > 0 || item.addOnGroupIds.length > 0;
  const plainLine = (item: MenuItem) =>
    lines.find((l) => l.itemId === item.id && l.variantId === null && l.addOnIds.length === 0);

  function tapAdd(item: MenuItem) {
    setNotice(null);
    if (hasChoices(item)) setChoosing(item);
    else add({ itemId: item.id, variantId: null, addOnIds: [], quantity: 1 });
  }
  function step(item: MenuItem, delta: number) {
    const line = plainLine(item);
    if (line) change((prev) => setQuantity(prev, line.key, line.quantity + delta));
    else if (delta > 0) tapAdd(item);
  }

  async function place() {
    if (placing) return;
    const items = itemIndex(data.menu);
    const usable = cart.filter((l) => items.get(l.itemId)?.inStock);
    if (usable.length === 0) return;
    setPlacing(true);
    setError(null);
    try {
      const placed = await placeGuestOrder(qrToken, {
        clientId: clientIdRef.current,
        items: usable.map((l) => ({
          itemId: l.itemId,
          variantId: l.variantId,
          addOnIds: l.addOnIds,
          quantity: l.quantity,
        })),
      });
      setCart([]);
      clientIdRef.current = newClientId();
      setCartOpen(false);
      setNotice(placed.status === "PENDING_APPROVAL" ? t("placedWaiting") : t("placedSent"));
      window.scrollTo({ top: 0 });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : null;
      setError(
        code === "ITEMS_UNAVAILABLE"
          ? t("outOfStockNow")
          : code === "ORDERING_OFF"
            ? t("orderingOff")
            : code === "TABLE_NOT_ORDERING"
              ? t("tableClosed")
              : t("needsInternet"),
      );
    } finally {
      setPlacing(false);
      void client.invalidateQueries({ queryKey: tableOrdersKey(qrToken) });
    }
  }

  const layer = enabled ? (
    <>
      {summary.count > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="mx-auto flex h-12 w-full max-w-2xl items-center justify-between gap-3 rounded-sm bg-primary px-4 text-base font-semibold text-primary-foreground"
          >
            <span className="flex items-center gap-2 tabular-nums">
              <ShoppingBag className="size-5" aria-hidden="true" />
              {t("summary", {
                count: summary.count,
                total: formatINR(summary.subtotal, { paise: "auto" }),
              })}
            </span>
            <span>{t("viewOrder")}</span>
          </button>
        </div>
      ) : null}

      <Sheet open={choosing !== null} onOpenChange={(o) => !o && setChoosing(null)}>
        {choosing ? (
          <ChoicesSheet
            key={choosing.id}
            item={choosing}
            menu={data.menu}
            onAdd={(draft) => {
              add(draft);
              setChoosing(null);
            }}
          />
        ) : null}
      </Sheet>

      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        {cartOpen ? (
          <GuestCartSheet
            lines={lines}
            menu={data.menu}
            pricesIncludeTax={data.outlet.pricesIncludeTax}
            approval={data.outlet.orderingMode === "SELF_ORDER_APPROVAL"}
            placing={placing}
            error={error}
            onQuantity={(key, quantity) => change((prev) => setQuantity(prev, key, quantity))}
            onPlace={() => void place()}
          />
        ) : null}
      </Sheet>
    </>
  ) : null;

  return {
    enabled,
    notice,
    hasBar: summary.count > 0,
    countOf: (itemId: string) => countOf(lines, itemId),
    hasChoices,
    plainCount: (item: MenuItem) => plainLine(item)?.quantity ?? 0,
    tapAdd,
    step,
    layer,
  };
}
