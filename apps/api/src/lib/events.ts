import type { OutletEvent, OutletEventName, OutletEvents } from "@restoos/shared";
import type { TenantContext } from "./tenant";

// publishEvent() (plan §8). Routes await it after a successful write with a typed event from
// packages/shared/src/events.ts. Listeners today: the customer-menu cache (M2-T5); M4 attaches
// Socket.io. Awaiting means the response goes out only after caches are busted, so a reader
// right after a change never sees the old menu.
// Listeners run in subscription order (see publishEvent).
// Listeners must never break the write that triggered them: their errors are reported, never
// thrown, and the returned promise always resolves.

export type EventListener = (ctx: TenantContext, event: OutletEvent) => void | Promise<void>;

export type EventBus = {
  publishEvent<K extends OutletEventName>(
    ctx: TenantContext,
    name: K,
    payload: OutletEvents[K],
  ): Promise<void>;
  /** Returns an unsubscribe function. */
  subscribe(listener: EventListener): () => void;
};

export function createEventBus(
  onListenerError: (err: unknown) => void = () => undefined,
): EventBus {
  const listeners = new Set<EventListener>();
  return {
    async publishEvent(ctx, name, payload) {
      const event = { name, payload } as OutletEvent;
      // One after another, in subscription order: the menu-cache bust (subscribed first in
      // app.ts) must finish before the Socket.io emit, or a phone refetching on the event can
      // read the old cached menu and stay stale (seen in the M5-T6 live-stock E2E).
      for (const listener of [...listeners]) {
        try {
          await listener(ctx, event);
        } catch (err) {
          onListenerError(err);
        }
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
