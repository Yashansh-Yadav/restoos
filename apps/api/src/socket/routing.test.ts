import { OUTLET_EVENT_NAMES } from "@restoos/shared";
import { describe, expect, it } from "vitest";
import { rooms } from "./rooms";
import { EVENT_ROUTES, roomsFor } from "./routing";

describe("event → room routing (M4-T2)", () => {
  it("routes every event somewhere", () => {
    for (const name of OUTLET_EVENT_NAMES)
      expect(EVENT_ROUTES[name].length, name).toBeGreaterThan(0);
  });

  it("sends menu, stock and settings changes to customers too", () => {
    expect(roomsFor("o1", "menu.stockChanged")).toEqual([
      rooms.staff("o1"),
      rooms.owner("o1"),
      rooms.public("o1"),
    ]);
    expect(roomsFor("o1", "outlet.settingsChanged")).toContain(rooms.public("o1"));
  });

  it("never sends floor, assignment or table status events to customers", () => {
    for (const name of ["floor.changed", "assignment.changed", "table.statusChanged"] as const) {
      expect(roomsFor("o1", name)).toEqual([rooms.staff("o1"), rooms.owner("o1")]);
    }
  });
});
