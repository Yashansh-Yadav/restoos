// Socket.io test client helpers (M4): connect to a listening app as staff, owner or customer.
import type { AddressInfo } from "node:net";
import type { ServerToClientEvents } from "@restoos/shared";
import { io as connectClient, type Socket } from "socket.io-client";
import type { App } from "../app";
import { SOCKET_PATH } from "../socket/server";
import { ORIGIN } from "./auth-harness";

export type TestSocket = Socket<ServerToClientEvents>;

export const cookieOf = (jar: Map<string, string>) =>
  [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

const portOf = (app: App) => (app.server.address() as AddressInfo).port;

/** Opens connections and closes them all in `closeAll()` (call it in afterEach). */
export function socketClients() {
  const open: TestSocket[] = [];
  return {
    /** Resolves with the connected socket, or rejects with the connect_error code. */
    connect(app: App, opts: { cookie?: string; auth?: Record<string, string> } = {}) {
      const socket: TestSocket = connectClient(`http://127.0.0.1:${portOf(app)}`, {
        path: SOCKET_PATH,
        addTrailingSlash: false,
        transports: ["websocket"],
        reconnection: false,
        forceNew: true,
        extraHeaders: { origin: ORIGIN, ...(opts.cookie ? { cookie: opts.cookie } : {}) },
        auth: opts.auth ?? {},
      });
      open.push(socket);
      return new Promise<TestSocket>((resolve, reject) => {
        socket.once("connect", () => resolve(socket));
        socket.once("connect_error", (err: Error & { data?: { code?: string } }) =>
          reject(new Error(err.data?.code ?? err.message)),
        );
      });
    },
    closeAll() {
      for (const s of open.splice(0)) s.disconnect();
    },
  };
}
