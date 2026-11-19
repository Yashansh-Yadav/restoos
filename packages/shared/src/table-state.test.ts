import { describe, expect, it } from "vitest";
import { tableStatusSchema, type TableStatus } from "./enums";
import {
  isMovable,
  mergedStatus,
  allowedEvents,
  InvalidTableTransition,
  MANUAL_TABLE_EVENTS,
  manualTableEventSchema,
  nextTableStatus,
  sessionEffect,
  TABLE_EVENTS,
  type TableEvent,
} from "./table-state";

const STATUSES = tableStatusSchema.options;

// The full machine, written out independently of the implementation.
const EXPECTED: Record<TableStatus, Partial<Record<TableEvent, TableStatus>>> = {
  FREE: { seat: "OCCUPIED", order: "ORDERED" },
  OCCUPIED: { unseat: "FREE", order: "ORDERED" },
  ORDERED: { order: "ORDERED", requestBill: "BILL_REQUESTED" },
  BILL_REQUESTED: { order: "ORDERED", pay: "PAID" },
  PAID: { clear: "CLEANING" },
  CLEANING: { cleaned: "FREE" },
};

describe("table state machine (M3-T4, plan §5.6)", () => {
  for (const from of STATUSES) {
    for (const event of TABLE_EVENTS) {
      const to = EXPECTED[from][event];
      it(`${from} + ${event} → ${to ?? "throws"}`, () => {
        if (to) expect(nextTableStatus(from, event)).toBe(to);
        else expect(() => nextTableStatus(from, event)).toThrow(InvalidTableTransition);
      });
    }
  }

  it("lists the allowed events per status", () => {
    for (const from of STATUSES) {
      expect(allowedEvents(from).sort()).toEqual(Object.keys(EXPECTED[from]).sort());
    }
  });

  it("every status can get back to FREE", () => {
    for (const start of STATUSES) {
      const seen = new Set<TableStatus>([start]);
      const queue: TableStatus[] = [start];
      while (queue.length) {
        const s = queue.shift() as TableStatus;
        for (const e of allowedEvents(s)) {
          const n = nextTableStatus(s, e);
          if (!seen.has(n)) {
            seen.add(n);
            queue.push(n);
          }
        }
      }
      expect(seen.has("FREE"), start).toBe(true);
    }
  });

  it("opens a session when guests arrive and closes it when paid or they leave", () => {
    expect(sessionEffect("FREE", "seat")).toBe("open");
    expect(sessionEffect("FREE", "order")).toBe("open");
    expect(sessionEffect("OCCUPIED", "order")).toBeNull();
    expect(sessionEffect("BILL_REQUESTED", "pay")).toBe("close");
    expect(sessionEffect("OCCUPIED", "unseat")).toBe("close");
    expect(sessionEffect("CLEANING", "cleaned")).toBeNull();
  });

  it("only seat, unseat, clear and cleaned are manual", () => {
    expect([...MANUAL_TABLE_EVENTS]).toEqual(["seat", "unseat", "clear", "cleaned"]);
    expect(manualTableEventSchema.safeParse("pay").success).toBe(false);
  });
});

describe("move / merge (M5-T7)", () => {
  it("only tables with guests who haven't paid can be moved or merged", () => {
    expect(tableStatusSchema.options.filter(isMovable)).toEqual([
      "OCCUPIED",
      "ORDERED",
      "BILL_REQUESTED",
    ]);
  });

  it("works out the joined table's status", () => {
    expect(mergedStatus("OCCUPIED", "OCCUPIED")).toBe("OCCUPIED");
    expect(mergedStatus("OCCUPIED", "ORDERED")).toBe("ORDERED");
    expect(mergedStatus("ORDERED", "OCCUPIED")).toBe("ORDERED");
    // More food joins a table waiting for its bill: back to ordering.
    expect(mergedStatus("BILL_REQUESTED", "ORDERED")).toBe("ORDERED");
    expect(mergedStatus("BILL_REQUESTED", "OCCUPIED")).toBe("ORDERED");
    expect(mergedStatus("ORDERED", "BILL_REQUESTED")).toBe("ORDERED");
    expect(mergedStatus("BILL_REQUESTED", "BILL_REQUESTED")).toBe("BILL_REQUESTED");
  });
});
