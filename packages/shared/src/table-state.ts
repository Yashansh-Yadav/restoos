import { z } from "zod";
import type { TableStatus } from "./enums";

// Table status state machine (plan §5.6, M3-T4). The only place the rules live: the API's
// transitionTable() enforces them, the staff floor screen uses them to offer valid actions.
//
//   FREE → OCCUPIED → ORDERED → BILL_REQUESTED → PAID → CLEANING → FREE
//              ↑______________ (more items) ______|
//
// Plus `unseat` (OCCUPIED → FREE): guests left before ordering (decision log 2026-11-18).

export const TABLE_EVENTS = [
  "seat",
  "unseat",
  "order",
  "requestBill",
  "pay",
  "clear",
  "cleaned",
] as const;
export type TableEvent = (typeof TABLE_EVENTS)[number];

/** Events staff trigger by hand on the floor screen; the rest come from orders and bills. */
export const MANUAL_TABLE_EVENTS = ["seat", "unseat", "clear", "cleaned"] as const;
export const manualTableEventSchema = z.enum(MANUAL_TABLE_EVENTS);
export type ManualTableEvent = z.infer<typeof manualTableEventSchema>;

const TRANSITIONS: Record<TableEvent, Partial<Record<TableStatus, TableStatus>>> = {
  seat: { FREE: "OCCUPIED" },
  unseat: { OCCUPIED: "FREE" },
  order: { FREE: "ORDERED", OCCUPIED: "ORDERED", ORDERED: "ORDERED", BILL_REQUESTED: "ORDERED" },
  requestBill: { ORDERED: "BILL_REQUESTED" },
  pay: { BILL_REQUESTED: "PAID" },
  clear: { PAID: "CLEANING" },
  cleaned: { CLEANING: "FREE" },
};

/** Events that start a table session (guests arrive) or end it (paid, or left unserved). */
export const sessionEffect = (from: TableStatus, event: TableEvent): "open" | "close" | null =>
  (event === "seat" || event === "order") && from === "FREE"
    ? "open"
    : event === "pay" || event === "unseat"
      ? "close"
      : null;

export class InvalidTableTransition extends Error {
  constructor(
    readonly from: TableStatus,
    readonly event: TableEvent,
  ) {
    super(`A ${from} table can't ${event}`);
    this.name = "InvalidTableTransition";
  }
}

/** The status after `event`, or throws InvalidTableTransition. */
export function nextTableStatus(from: TableStatus, event: TableEvent): TableStatus {
  const to = TRANSITIONS[event][from];
  if (!to) throw new InvalidTableTransition(from, event);
  return to;
}

export function canTransition(from: TableStatus, event: TableEvent): boolean {
  return TRANSITIONS[event][from] !== undefined;
}

/** What can happen next from this status (in TABLE_EVENTS order). */
export function allowedEvents(from: TableStatus): TableEvent[] {
  return TABLE_EVENTS.filter((e) => canTransition(from, e));
}
