// M4-T1: Socket.io handshake auth (staff / owner / customer) and §8 rooms, isolation between
// restaurants, and the Redis adapter fanning out across two API instances.
import type { AddressInfo } from "node:net";
import { seedPlans } from "@restoos/db/testing";
import { floorSectionSchema, floorTableSchema } from "@restoos/shared";
import { io as connectClient, type Socket as ClientSocket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp, type App } from "../app";
import type { Auth } from "../lib/auth";
import { ORIGIN, createAuthHarness } from "../test/auth-harness";
import { browser, restaurant } from "../test/restaurant";
import { rooms } from "./rooms";
import { SOCKET_PATH } from "./server";

type Harness = Awaited<ReturnType<typeof createAuthHarness>>;
let h: Harness;
const clients: ClientSocket[] = [];
const extraApps: App[] = [];

afterEach(async () => {
  for (const c of clients.splice(0)) c.disconnect();
  for (const a of extraApps.splice(0)) await a.close();
  await h.close();
});

const portOf = (app: App) => (app.server.address() as AddressInfo).port;
const cookieOf = (jar: Map<string, string>) => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

/** Connects and resolves with the socket, or rejects with the connect_error code. */
function connect(
  app: App,
  opts: { cookie?: string; auth?: Record<string, string> } = {},
): Promise<ClientSocket> {
  const socket = connectClient(`http://127.0.0.1:${portOf(app)}`, {
    path: SOCKET_PATH,
    addTrailingSlash: false,
    transports: ["websocket"],
    reconnection: false,
    forceNew: true,
    extraHeaders: { origin: ORIGIN, ...(opts.cookie ? { cookie: opts.cookie } : {}) },
    auth: opts.auth ?? {},
  });
  clients.push(socket);
  return new Promise((resolve, reject) => {
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", (err: Error & { data?: { code?: string } }) =>
      reject(new Error(err.data?.code ?? err.message)),
    );
  });
}

const roomsOf = (app: App, socket: ClientSocket) => {
  const server = app.io?.of("/").sockets.get(socket.id ?? "");
  return [...(server?.rooms ?? [])].filter((r) => r !== socket.id).sort();
};

let captured: { auth: Auth } | undefined;
async function setup() {
  h = await createAuthHarness({
    setup: (_app, deps) => {
      captured = { auth: deps.auth };
    },
  });
  await seedPlans(h.prisma);
  await h.app.listen({ port: 0, host: "127.0.0.1" });
  const r = await restaurant(h);
  const floorApi = (url: string, body: object) => r.owner("POST", `/api/owner/floor${url}`, body);
  const hall = floorSectionSchema.parse(
    (await floorApi("/sections", { name: "Main Hall" })).json(),
  );
  const t1 = floorTableSchema.parse(
    (await floorApi("/tables", { sectionId: hall.id, label: "T1" })).json(),
  );
  return { r, t1 };
}

describe("Socket.io (M4-T1)", () => {
  it("puts staff in their outlet, role and employee rooms (kitchen too for cooks)", async () => {
    const { r } = await setup();
    const rahul = await r.addStaff("Rahul", "BUTLER", "4827");
    const imran = await r.addStaff("Imran", "KITCHEN", "5938");
    const butler = await connect(h.app, {
      cookie: cookieOf((await r.signedInTablet(rahul.id, "4827")).jar),
    });
    const cook = await connect(h.app, {
      cookie: cookieOf((await r.signedInTablet(imran.id, "5938")).jar),
    });
    const o = r.outletId;
    expect(roomsOf(h.app, butler)).toEqual(
      [rooms.staff(o), rooms.role(o, "BUTLER"), rooms.employee(o, rahul.id)].sort(),
    );
    expect(roomsOf(h.app, cook)).toEqual(
      [
        rooms.staff(o),
        rooms.role(o, "KITCHEN"),
        rooms.employee(o, imran.id),
        rooms.kitchen(o),
      ].sort(),
    );

    // A paired tablet with nobody signed in is refused.
    const { pairingCode } = await r.newDevice("Idle tablet");
    const idle = browser(h);
    await idle.call("POST", "/api/device/pair", { code: pairingCode });
    await expect(connect(h.app, { cookie: cookieOf(idle.jar) })).rejects.toThrow("UNAUTHENTICATED");
  });

  it("lets owners into their own outlet's owner room only", async () => {
    const { r } = await setup();
    const owner = await connect(h.app, {
      cookie: cookieOf(h.jar),
      auth: { outletId: r.outletId },
    });
    expect(roomsOf(h.app, owner)).toEqual([rooms.owner(r.outletId)]);
    await expect(connect(h.app, { cookie: cookieOf(h.jar) })).rejects.toThrow("OUTLET_REQUIRED");
    await expect(connect(h.app)).rejects.toThrow("UNAUTHENTICATED");

    h.clearCookies();
    await restaurant(h, "+919876500002");
    await expect(
      connect(h.app, { cookie: cookieOf(h.jar), auth: { outletId: r.outletId } }),
    ).rejects.toThrow("OUTLET_FORBIDDEN");
  });

  it("lets a customer into their table room by QR token; rotated tokens are refused", async () => {
    const { r, t1 } = await setup();
    const guest = await connect(h.app, { auth: { qrToken: t1.qrToken } });
    expect(roomsOf(h.app, guest)).toEqual(
      [rooms.table(t1.qrToken), rooms.public(r.outletId)].sort(),
    );
    await expect(connect(h.app, { auth: { qrToken: "../../etc" } })).rejects.toThrow(
      "TABLE_NOT_FOUND",
    );
    await expect(connect(h.app, { auth: { qrToken: "A".repeat(22) } })).rejects.toThrow(
      "TABLE_NOT_FOUND",
    );

    await r.owner("POST", `/api/owner/floor/tables/${t1.id}/rotate-qr`);
    await expect(connect(h.app, { auth: { qrToken: t1.qrToken } })).rejects.toThrow(
      "TABLE_NOT_FOUND",
    );
  });

  it("keeps restaurants apart and fans out across instances through Redis", async () => {
    const { r } = await setup();
    const rahul = await r.addStaff("Rahul", "BUTLER", "4827");
    const ours = await connect(h.app, {
      cookie: cookieOf((await r.signedInTablet(rahul.id, "4827")).jar),
    });

    h.clearCookies();
    const other = await restaurant(h, "+919876500002");
    const theirOwner = await connect(h.app, {
      cookie: cookieOf(h.jar),
      auth: { outletId: other.outletId },
    });

    // A second API instance on the same Redis: a client there gets emits made on instance 1.
    if (!captured) throw new Error("harness setup did not run");
    const app2 = await buildApp({
      docs: false,
      deps: {
        prisma: h.prisma,
        redis: h.redis,
        storage: h.storage,
        auth: captured.auth,
        appUrl: ORIGIN,
        googleEnabled: true,
      },
    });
    extraApps.push(app2);
    await app2.listen({ port: 0, host: "127.0.0.1" });
    const ownerOnApp2 = await connect(app2, {
      cookie: cookieOf(h.jar),
      auth: { outletId: other.outletId },
    });

    // The second instance's Redis subscription is set up asynchronously: wait until a warm-up
    // emit gets through before measuring.
    let warm = false;
    ownerOnApp2.on("assignment.changed", () => {
      warm = true;
    });
    await expect
      .poll(
        () => {
          h.app.io
            ?.to(rooms.owner(other.outletId))
            .emit("assignment.changed", { outletId: "warm" });
          return warm;
        },
        { timeout: 15_000, interval: 200 },
      )
      .toBe(true);

    const got = { ours: [] as unknown[], theirs: [] as unknown[], app2: [] as unknown[] };
    ours.on("floor.changed", (p: unknown) => got.ours.push(p));
    theirOwner.on("floor.changed", (p: unknown) => got.theirs.push(p));
    ownerOnApp2.on("floor.changed", (p: unknown) => got.app2.push(p));

    h.app.io?.to(rooms.staff(r.outletId)).emit("floor.changed", { outletId: "A staff" });
    h.app.io?.to(rooms.owner(other.outletId)).emit("floor.changed", { outletId: "B owner" });

    await expect.poll(() => got.app2.length, { timeout: 5_000 }).toBe(1);
    expect(got.ours).toEqual([{ outletId: "A staff" }]);
    expect(got.theirs).toEqual([{ outletId: "B owner" }]);
    expect(got.app2).toEqual([{ outletId: "B owner" }]);
  });
});
