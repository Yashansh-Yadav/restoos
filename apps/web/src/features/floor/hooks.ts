"use client";

import type { Floor } from "@restoos/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { getFloor } from "./api";

export const floorKey = (outletId: string) => ["floor", outletId] as const;

export function useFloor(outletId: string, initialData: Floor) {
  return useQuery({ queryKey: floorKey(outletId), queryFn: () => getFloor(outletId), initialData });
}

/** Refetch the floor after a write. */
export function useRefreshFloor(outletId: string) {
  const client = useQueryClient();
  return useCallback(
    () => client.invalidateQueries({ queryKey: floorKey(outletId) }),
    [client, outletId],
  );
}

/** Readable message for a failed floor write. */
export function floorError(err: unknown): string {
  if (
    err instanceof Error &&
    "status" in err &&
    typeof err.status === "number" &&
    err.status < 500
  ) {
    return err.message;
  }
  return "Couldn't save. Check your connection and try again.";
}
