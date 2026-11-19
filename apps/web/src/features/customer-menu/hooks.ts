"use client";

import type { PublicMenu } from "@restoos/shared";
import { useQuery } from "@tanstack/react-query";
import { getPublicMenu, getTableOrders } from "./api";

export const publicMenuKey = (qrToken: string) => ["public-menu", qrToken] as const;

/** Kept fresh by useTableSocket (menu, stock, ordering-mode changes). */
export function usePublicMenu(qrToken: string, initialData: PublicMenu) {
  return useQuery({
    queryKey: publicMenuKey(qrToken),
    queryFn: () => getPublicMenu(qrToken),
    initialData,
  });
}

export const tableOrdersKey = (qrToken: string) => ["table-orders", qrToken] as const;

/** The guest's orders this sitting (M5-T6b); live via useTableSocket. */
export function useTableOrders(qrToken: string, enabled: boolean) {
  return useQuery({
    queryKey: tableOrdersKey(qrToken),
    queryFn: () => getTableOrders(qrToken),
    enabled,
  });
}
