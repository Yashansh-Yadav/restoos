"use client";

import type { StaffFloor } from "@restoos/shared";
import { useQuery } from "@tanstack/react-query";
import { getStaffFloor } from "./api";

export const staffFloorKey = ["staff-floor"] as const;

/** Kept fresh by useOutletSocket (M4-T3) — no polling; refetches on focus as a fallback. */
export function useStaffFloor(initialData: StaffFloor) {
  return useQuery({
    queryKey: staffFloorKey,
    queryFn: () => getStaffFloor(),
    initialData,
    refetchOnWindowFocus: true,
  });
}

export function floorActionError(err: unknown): string {
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
