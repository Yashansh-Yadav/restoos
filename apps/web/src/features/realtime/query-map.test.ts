import { OUTLET_EVENT_NAMES } from "@restoos/shared";
import { describe, expect, it, vi } from "vitest";
import {
  EVENT_QUERY_PREFIXES,
  invalidateAllLive,
  invalidateFor,
  LIVE_QUERY_PREFIXES,
} from "./query-map";

describe("live event → query map (M4-T3)", () => {
  it("gives every event something to refresh", () => {
    for (const name of OUTLET_EVENT_NAMES) {
      expect(EVENT_QUERY_PREFIXES[name].length, name).toBeGreaterThan(0);
    }
  });

  it("invalidates exactly the event's prefixes", () => {
    const client = { invalidateQueries: vi.fn() };
    invalidateFor(client, "table.statusChanged");
    expect(client.invalidateQueries.mock.calls).toEqual([
      [{ queryKey: ["staff-floor"] }],
      [{ queryKey: ["order-pad"] }],
    ]);

    client.invalidateQueries.mockClear();
    invalidateFor(client, "menu.stockChanged");
    expect(client.invalidateQueries.mock.calls).toEqual([
      [{ queryKey: ["menu"] }],
      [{ queryKey: ["stock"] }],
      [{ queryKey: ["order-pad"] }],
      [{ queryKey: ["public-menu"] }],
    ]);
  });

  it("refetches every live prefix once after a reconnect", () => {
    const client = { invalidateQueries: vi.fn() };
    invalidateAllLive(client);
    const keys = client.invalidateQueries.mock.calls.map(([arg]) => JSON.stringify(arg.queryKey));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.sort()).toEqual(LIVE_QUERY_PREFIXES.map((k) => JSON.stringify(k)).sort());
    expect(keys).toContain(JSON.stringify(["staff-floor"]));
  });
});
