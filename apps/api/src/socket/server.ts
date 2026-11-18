import fastifyCookie from "@fastify/cookie";
import type { PrismaClient } from "@restoos/db";
import { QR_TOKEN_FORMAT } from "@restoos/shared";
import { createAdapter } from "@socket.io/redis-adapter";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import { Server, type Socket } from "socket.io";
import type { Redis } from "../lib/redis";
import type { ResolveActor } from "../plugins/tenant";
import { rooms } from "./rooms";

// Socket.io on the API (M4-T1, plan §8). Same origin as the REST API (/api/socket.io), so the
// Next rewrite (dev) and Caddy (production) route it and cookies are first-party — no CORS.
// The handshake reuses the HTTP auth rules (resolveActor) and puts each connection in its rooms:
//   staff device + PIN cookies → outlet staff, role, employee (+ kitchen) rooms
//   owner session + auth.outletId → outlet owner room
//   customer auth.qrToken → table room only
// Server → client only for now: nothing listens to client-emitted events.
// The Redis adapter fans emits out across API instances (and, later, workers).

export const SOCKET_PATH = "/api/socket.io";

export type SocketIdentity =
  | { kind: "staff"; outletId: string; employeeId: string }
  | { kind: "owner"; outletId: string; userId: string }
  | { kind: "customer"; outletId: string; tableId: string };

type SocketData = { identity: SocketIdentity };
/** Server → client events; typed per event in M4-T2 (packages/shared/src/events.ts). */
type ServerEvents = Record<string, (payload: unknown) => void>;
export type RestoServer = Server<Record<string, never>, ServerEvents, object, SocketData>;

class HandshakeError extends Error {
  readonly data: { code: string };
  constructor(code: string, message: string) {
    super(message);
    this.data = { code };
  }
}

const authField = (socket: Socket, key: string): unknown =>
  (socket.handshake.auth as Record<string, unknown> | undefined)?.[key];

export function attachSocketServer(
  app: FastifyInstance,
  deps: { prisma: PrismaClient; redis: Redis; resolveActor: ResolveActor; log: FastifyBaseLogger },
): RestoServer {
  const io: RestoServer = new Server(app.server, {
    path: SOCKET_PATH,
    serveClient: false,
    maxHttpBufferSize: 16 * 1024,
    // Next.js 308-redirects "/api/socket.io/" to drop the slash, so serve the path without one
    // (clients must also pass addTrailingSlash: false).
    addTrailingSlash: false,
    // Same origin only (the browser sends cookies); no CORS headers on purpose.
  });

  // Redis adapter: two dedicated connections, opened only once the server listens (apps built
  // just for app.inject() never need them). If Redis is unavailable, local delivery still works
  // (emits reach this instance's clients); errors are logged, never thrown.
  let adapterClients: Redis[] = [];
  app.addHook("onListen", async () => {
    const pub = deps.redis.duplicate();
    const sub = deps.redis.duplicate();
    adapterClients = [pub, sub];
    for (const client of adapterClients) {
      client.on("error", (err: unknown) => deps.log.warn({ err }, "socket redis adapter error"));
    }
    io.adapter(createAdapter(pub, sub));
    // Ready before we report "listening", so the first emit already fans out.
    await Promise.all(
      adapterClients.map(
        (c) =>
          new Promise<void>((resolve) => {
            if (c.status === "ready") resolve();
            else {
              c.once("ready", () => resolve());
              c.once("error", () => resolve());
            }
          }),
      ),
    );
  });

  io.use((socket, next) => {
    void identify(socket, deps)
      .then(({ identity, join }) => {
        socket.data.identity = identity;
        void socket.join(join);
        next();
      })
      .catch((err: unknown) => {
        if (err instanceof HandshakeError) {
          deps.log.info({ code: err.data.code }, "socket refused");
          next(err);
        } else {
          deps.log.error({ err }, "socket handshake failed");
          next(new HandshakeError("UNAVAILABLE", "Couldn't connect. Try again."));
        }
      });
  });

  io.on("connection", (socket) => {
    deps.log.debug({ kind: socket.data.identity.kind }, "socket connected");
  });

  app.addHook("preClose", async () => {
    io.local.disconnectSockets(true);
    io.engine.close();
  });
  app.addHook("onClose", async () => {
    await Promise.allSettled(adapterClients.map((c) => c.quit()));
  });

  return io;
}

async function identify(
  socket: Socket,
  deps: { prisma: PrismaClient; resolveActor: ResolveActor },
): Promise<{ identity: SocketIdentity; join: string[] }> {
  // Customer page: a table's QR token, nothing else.
  const qrToken = authField(socket, "qrToken");
  if (qrToken !== undefined) {
    if (typeof qrToken !== "string" || !QR_TOKEN_FORMAT.test(qrToken)) {
      throw new HandshakeError("TABLE_NOT_FOUND", "This table's QR code isn't valid.");
    }
    // Uncached on purpose: a rotated QR stops working at once.
    const table = await deps.prisma.diningTable.findUnique({
      where: { qrToken },
      select: { id: true, outletId: true },
    });
    if (!table) throw new HandshakeError("TABLE_NOT_FOUND", "This table's QR code isn't valid.");
    return {
      identity: { kind: "customer", outletId: table.outletId, tableId: table.id },
      join: [rooms.table(qrToken)],
    };
  }

  const cookies = fastifyCookie.parse(socket.handshake.headers.cookie ?? "");
  const result = await deps.resolveActor({
    headers: socket.handshake.headers,
    cookies,
    outletId: authField(socket, "outletId"),
  });
  if (!result.ok) throw new HandshakeError(result.code, result.message);
  const { ctx } = result;
  const outletId = ctx.outletId;
  if (!outletId) throw new HandshakeError("OUTLET_REQUIRED", "Choose an outlet first.");

  if (ctx.actor.kind === "staff") {
    const { employeeId, role } = ctx.actor;
    return {
      identity: { kind: "staff", outletId, employeeId },
      join: [
        rooms.staff(outletId),
        rooms.role(outletId, role),
        rooms.employee(outletId, employeeId),
        ...(role === "KITCHEN" ? [rooms.kitchen(outletId)] : []),
      ],
    };
  }
  if (ctx.actor.kind === "owner") {
    return {
      identity: { kind: "owner", outletId, userId: ctx.actor.userId },
      join: [rooms.owner(outletId)],
    };
  }
  throw new HandshakeError("UNAUTHENTICATED", "Sign in to continue");
}
