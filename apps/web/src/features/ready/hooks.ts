"use client";

import type { ReadyList } from "@restoos/shared";
import { useQuery } from "@tanstack/react-query";
import { getReadyList } from "./api";

export const readyKey = ["ready"] as const;

/** Kept fresh by useOutletSocket (kot.itemStatusChanged); refetches on focus. */
export function useReadyList(initialData: ReadyList) {
  return useQuery({ queryKey: readyKey, queryFn: getReadyList, initialData });
}
