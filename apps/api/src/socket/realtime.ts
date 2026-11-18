import type { RestoServer } from "./server";

// What modules may do with live connections (M4-T2): cut them off. Late-bound because module
// routes are registered before the Socket.io server is attached; a no-op until then (and in
// apps without sockets, like DB-free unit tests).
export type Realtime = {
  /** Disconnect every socket in these rooms (on all API instances, via the adapter). */
  disconnect(rooms: string[]): void;
};

export function createRealtime(): Realtime & { attach(io: RestoServer): void } {
  let server: RestoServer | undefined;
  return {
    attach(io) {
      server = io;
    },
    disconnect(rooms) {
      if (server && rooms.length > 0) server.in(rooms).disconnectSockets(true);
    },
  };
}
