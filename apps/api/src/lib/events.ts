import type { OutletEvent, OutletEventName, OutletEvents } from "@restoos/shared";
import type { TenantContext } from "./tenant";

// publishEvent() (plan §8). Routes call it after a successful write with a typed event from
// packages/shared/src/events.ts. Until M4 attaches Socket.io (and the M2-T5 menu cache listens),
// nothing is subscribed, so it's a no-op — but every call site is already in place.
// Listeners must never break the write that triggered them: their errors are reported, not thrown.

export type EventListener = (ctx: TenantContext, event: OutletEvent) => void | Promise<void>;

export type EventBus = {
  publishEvent<K extends OutletEventName>(
    ctx: TenantContext,
    name: K,
    payload: OutletEvents[K],
  ): void;
  /** Returns an unsubscribe function. */
  subscribe(listener: EventListener): () => void;
};

export function createEventBus(
  onListenerError: (err: unknown) => void = () => undefined,
): EventBus {
  const listeners = new Set<EventListener>();
  return {
    publishEvent(ctx, name, payload) {
      const event = { name, payload } as OutletEvent;
      for (const listener of listeners) {
        try {
          void Promise.resolve(listener(ctx, event)).catch(onListenerError);
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
