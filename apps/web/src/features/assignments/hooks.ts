"use client";

import type { AssignmentBoard } from "@restoos/shared";
import { useQuery } from "@tanstack/react-query";
import { getBoard } from "./api";

export const boardKey = (outletId?: string) => ["assignments", outletId ?? "device"] as const;

export function useAssignmentBoard(initialData: AssignmentBoard, outletId?: string) {
  return useQuery({ queryKey: boardKey(outletId), queryFn: () => getBoard(outletId), initialData });
}

/** Readable message for a failed assignment. */
export function assignError(err: unknown): string {
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
