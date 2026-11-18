import { OUTLET_EVENT_NAMES, type OutletEventName } from "@restoos/shared";
import type { QueryClient, QueryKey } from "@tanstack/react-query";

// Which client data each live event makes stale (M4-T3). Typed over the shared event list, so a
// new event has to say what it refreshes. Prefix keys: ["menu"] refreshes every outlet's menu.

export const EVENT_QUERY_PREFIXES: { readonly [K in OutletEventName]: readonly QueryKey[] } = {
  "menu.changed": [["menu"], ["stock"], ["order-pad"]],
  "menu.stockChanged": [["menu"], ["stock"], ["order-pad"]],
  "outlet.settingsChanged": [["menu"], ["stock"], ["order-pad"]],
  "floor.changed": [["floor"], ["staff-floor"], ["assignments"]],
  "assignment.changed": [["assignments"], ["staff-floor"]],
  "table.statusChanged": [["staff-floor"], ["order-pad"]],
  "order.created": [["staff-floor"], ["order-pad"]],
};

/** Every key any event touches: refetched after a reconnect, in case events were missed. */
export const LIVE_QUERY_PREFIXES: readonly QueryKey[] = [
  ...new Map(
    OUTLET_EVENT_NAMES.flatMap((n) => EVENT_QUERY_PREFIXES[n]).map((k) => [JSON.stringify(k), k]),
  ).values(),
];

export function invalidateFor(
  client: Pick<QueryClient, "invalidateQueries">,
  name: OutletEventName,
) {
  for (const queryKey of EVENT_QUERY_PREFIXES[name]) void client.invalidateQueries({ queryKey });
}

export function invalidateAllLive(client: Pick<QueryClient, "invalidateQueries">) {
  for (const queryKey of LIVE_QUERY_PREFIXES) void client.invalidateQueries({ queryKey });
}
