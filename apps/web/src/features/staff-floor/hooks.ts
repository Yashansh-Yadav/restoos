"use client";

import type { StaffFloor } from "@restoos/shared";
import { useQuery } from "@tanstack/react-query";
import { getStaffFloor } from "./api";

export const staffFloorKey = ["staff-floor"] as const;

/** Polls every 20 s and on focus until M4's sockets push changes (decision log 2026-11-18). */
export function useStaffFloor(initialData: StaffFloor) {
  return useQuery({
    queryKey: staffFloorKey,
    queryFn: () => getStaffFloor(),
    initialData,
    refetchInterval: 20_000,
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
