"use client";

import type { KitchenBoard } from "@restoos/shared";
import { useQuery } from "@tanstack/react-query";
import { getKitchenBoard } from "./api";

export const kitchenKey = ["kitchen"] as const;

/** Kept fresh by useOutletSocket (kot.created / kot.itemStatusChanged); refetches on focus. */
export function useKitchenBoard(initialData: KitchenBoard) {
  return useQuery({ queryKey: kitchenKey, queryFn: getKitchenBoard, initialData });
}

export function kitchenError(err: unknown): string {
  if (
    err instanceof Error &&
    "status" in err &&
    typeof err.status === "number" &&
    err.status < 500
  ) {
    return err.message;
  }
  return "Couldn't update the ticket. Check the connection and tap again.";
}
