"use client";

import type { OwnerMenu } from "@restoos/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import * as api from "./api";

export const menuKey = (outletId: string) => ["menu", outletId] as const;

export function useMenu(outletId: string, initialData: OwnerMenu) {
  return useQuery({
    queryKey: menuKey(outletId),
    queryFn: () => api.getMenu(outletId),
    initialData,
  });
}

/** Refetch the menu after a write (sheets save several calls, then refresh once). */
export function useRefreshMenu(outletId: string) {
  const client = useQueryClient();
  return useCallback(
    () => client.invalidateQueries({ queryKey: menuKey(outletId) }),
    [client, outletId],
  );
}
