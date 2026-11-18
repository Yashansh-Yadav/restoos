import type { OutletEvent, ServerToClientEvents } from "@restoos/shared";
import { Emitter } from "@socket.io/redis-emitter";
import type { EventBus } from "../lib/events";
import type { Redis } from "../lib/redis";
import { roomsFor } from "./routing";

// publishEvent() for BullMQ workers (M4-T2, plan §8): workers have no HTTP server, so they
// publish into the Redis channels the API's Socket.io adapter listens on. Same signature and
// the same routing table as the API's event bus, so job code reads like route code.
// The bell escalation jobs (M8-T4) are the first users.
export function createWorkerEventBus(redis: Redis): EventBus {
  const emitter = new Emitter<ServerToClientEvents>(redis);
  return {
    async publishEvent(_ctx, name, payload) {
      const event = { name, payload } as OutletEvent;
      emitter.to(roomsFor(event.payload.outletId, event.name)).emit(event.name, event.payload);
    },
    subscribe() {
      return () => undefined; // workers only publish
    },
  };
}
