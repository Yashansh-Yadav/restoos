"use client";

import type { PublicMenu } from "@restoos/shared";
import { useQuery } from "@tanstack/react-query";
import { getPublicMenu } from "./api";

export const publicMenuKey = (qrToken: string) => ["public-menu", qrToken] as const;

/** Kept fresh by useTableSocket (menu, stock, ordering-mode changes). */
export function usePublicMenu(qrToken: string, initialData: PublicMenu) {
  return useQuery({
    queryKey: publicMenuKey(qrToken),
    queryFn: () => getPublicMenu(qrToken),
    initialData,
  });
}
