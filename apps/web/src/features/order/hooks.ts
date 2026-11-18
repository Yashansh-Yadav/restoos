"use client";

import type { OrderPad } from "@restoos/shared";
import { useQuery } from "@tanstack/react-query";
import { getOrderPad } from "./api";

export const orderPadKey = (tableId: string) => ["order-pad", tableId] as const;

/** Kept fresh by useOutletSocket (stock, menu, other sends for this table). */
export function useOrderPad(tableId: string, initialData: OrderPad) {
  return useQuery({
    queryKey: orderPadKey(tableId),
    queryFn: () => getOrderPad(tableId),
    initialData,
  });
}

export function orderError(err: unknown): string {
  if (
    err instanceof Error &&
    "status" in err &&
    typeof err.status === "number" &&
    err.status < 500
  ) {
    return err.message;
  }
  return "Couldn't send. Check your connection — tap Send again (it won't be sent twice).";
}
