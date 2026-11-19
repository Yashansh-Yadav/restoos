// Real-time events (plan §8). Typed map shared by the API (publishEvent) and, from M4, the web
// socket client. Until M4 attaches Socket.io, publishEvent is a no-op apart from listeners.

import type { TableStatus } from "./enums";
import type { KotStage } from "./kot-state";

export type OutletEvents = {
  /** Anything on the menu changed (items, categories, add-ons, photos). */
  "menu.changed": { outletId: string };
  /** One item went in or out of stock (M2-T4). */
  "menu.stockChanged": { outletId: string; itemId: string; inStock: boolean };
  /** Outlet settings changed (ordering mode, shift auto-start…) — busts the customer menu. */
  "outlet.settingsChanged": { outletId: string };
  /** Sections or tables were added, edited, moved or removed (M3-T1). */
  "floor.changed": { outletId: string };
  /** Butlers were given or taken off tables (M3-T3). */
  "assignment.changed": { outletId: string };
  /** A table moved through the state machine (M3-T4: seat, guests left, cleaning…). */
  "table.statusChanged": { outletId: string; tableId: string; status: TableStatus };
  /** Staff sent items to the kitchen for a table (M5-T1). */
  "order.created": { outletId: string; orderId: string; tableId: string };
  /** A kitchen ticket was created for a send (M5-T2); `number` is the day's KOT number. */
  "kot.created": {
    outletId: string;
    kotId: string;
    number: number;
    orderId: string;
    tableId: string;
  };
  /** The kitchen moved a ticket to New / Preparing / Ready (M5-T3). */
  "kot.itemStatusChanged": {
    outletId: string;
    kotId: string;
    tableId: string | null;
    stage: KotStage;
  };
};

export type OutletEventName = keyof OutletEvents;
export type OutletEvent = {
  [K in OutletEventName]: { name: K; payload: OutletEvents[K] };
}[OutletEventName];

/** Socket.io server → client contract (M4-T2): each event arrives with its typed payload. */
export type ServerToClientEvents = {
  [K in OutletEventName]: (payload: OutletEvents[K]) => void;
};

/** Every event name, for exhaustive routing tables and client subscriptions. */
export const OUTLET_EVENT_NAMES = [
  "menu.changed",
  "menu.stockChanged",
  "outlet.settingsChanged",
  "floor.changed",
  "assignment.changed",
  "table.statusChanged",
  "order.created",
  "kot.created",
  "kot.itemStatusChanged",
] as const satisfies readonly OutletEventName[];
type MissingEventName = Exclude<OutletEventName, (typeof OUTLET_EVENT_NAMES)[number]>;
// Compile-time check: adding an event to OutletEvents without listing it here fails the build.
export const ALL_EVENTS_LISTED: MissingEventName extends never ? true : never = true;
