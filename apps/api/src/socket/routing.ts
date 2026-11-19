import type { OutletEventName } from "@restoos/shared";
import { rooms } from "./rooms";

// Which rooms each published event reaches (plan §8, M4-T2). Typed over the shared event map:
// a new event without a routing entry is a compile error, so nothing is silently dropped or
// accidentally broadcast. Customers get outlet-wide events through `outlet:{o}:public` (one emit,
// no lookup of every table token); table-specific events (bill, bell) will use `table:{token}`.

export type Audience = "staff" | "owner" | "customers" | "kitchen";

export const EVENT_ROUTES: { readonly [K in OutletEventName]: readonly Audience[] } = {
  "menu.changed": ["staff", "owner", "customers"],
  "menu.stockChanged": ["staff", "owner", "customers"],
  "outlet.settingsChanged": ["staff", "owner", "customers"],
  "floor.changed": ["staff", "owner"],
  "assignment.changed": ["staff", "owner"],
  "table.statusChanged": ["staff", "owner"],
  // §8: staff + kitchen (the kitchen display arrives in M5-T3).
  "order.created": ["staff", "kitchen", "customers"],
  "kot.created": ["kitchen", "staff"],
  "kot.itemStatusChanged": ["kitchen", "staff"],
  // M5-T5: the kitchen stops cooking it; owners see voids (leakage).
  "order.itemVoided": ["kitchen", "staff", "owner"],
  // M5-T6b: guest orders. Customers get ids only and refetch their own table's list.
  "order.pendingApproval": ["staff", "owner", "customers"],
  "order.statusChanged": ["staff", "owner", "customers", "kitchen"],
};

const roomOf: Record<Audience, (outletId: string) => string> = {
  staff: rooms.staff,
  owner: rooms.owner,
  customers: rooms.public,
  kitchen: rooms.kitchen,
};

export function roomsFor(outletId: string, name: OutletEventName): string[] {
  return EVENT_ROUTES[name].map((a) => roomOf[a](outletId));
}
