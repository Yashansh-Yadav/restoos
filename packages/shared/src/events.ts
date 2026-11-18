// Real-time events (plan §8). Typed map shared by the API (publishEvent) and, from M4, the web
// socket client. Until M4 attaches Socket.io, publishEvent is a no-op apart from listeners.

import type { TableStatus } from "./enums";

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
};

export type OutletEventName = keyof OutletEvents;
export type OutletEvent = {
  [K in OutletEventName]: { name: K; payload: OutletEvents[K] };
}[OutletEventName];
