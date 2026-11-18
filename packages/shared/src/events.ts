// Real-time events (plan §8). Typed map shared by the API (publishEvent) and, from M4, the web
// socket client. Until M4 attaches Socket.io, publishEvent is a no-op apart from listeners.

export type OutletEvents = {
  /** Anything on the menu changed (items, categories, add-ons, photos). */
  "menu.changed": { outletId: string };
  /** One item went in or out of stock (M2-T4). */
  "menu.stockChanged": { outletId: string; itemId: string; inStock: boolean };
  /** Outlet settings changed (ordering mode, shift auto-start…) — busts the customer menu. */
  "outlet.settingsChanged": { outletId: string };
};

export type OutletEventName = keyof OutletEvents;
export type OutletEvent = {
  [K in OutletEventName]: { name: K; payload: OutletEvents[K] };
}[OutletEventName];
