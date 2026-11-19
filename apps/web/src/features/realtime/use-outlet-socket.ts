"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { invalidateAllLive, invalidateFor } from "./query-map";
import { subscribeLive, subscribeTable, type LiveStatus } from "./socket";

/**
 * Keeps this screen live (M4-T3): every event for the outlet marks the matching TanStack Query
 * data stale (see query-map.ts), and a reconnect refetches everything live. Staff devices pass
 * nothing; owners pass the outlet they're working in.
 */
export function useOutletSocket({ outletId }: { outletId?: string } = {}): { status: LiveStatus } {
  const client = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>("connecting");
  useEffect(
    () =>
      subscribeLive(outletId, {
        onEvent: (name) => invalidateFor(client, name),
        onStatus: setStatus,
        onReconnected: () => invalidateAllLive(client),
      }),
    [client, outletId],
  );
  return { status };
}

/** The customer table page (M5-T6a): same invalidation map, joined with the table's QR token. */
export function useTableSocket(qrToken: string): { status: LiveStatus } {
  const client = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>("connecting");
  useEffect(
    () =>
      subscribeTable(qrToken, {
        onEvent: (name) => invalidateFor(client, name),
        onStatus: setStatus,
        onReconnected: () => invalidateAllLive(client),
      }),
    [client, qrToken],
  );
  return { status };
}
