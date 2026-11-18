import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A fake socket.io-client socket: records connect/disconnect calls, lets tests fire events.
type Handler = (...args: unknown[]) => void;
const fake = vi.hoisted(() => {
  const handlers = new Map<string, Handler[]>();
  const socket = {
    disconnected: false,
    on(name: string, fn: Handler) {
      handlers.set(name, [...(handlers.get(name) ?? []), fn]);
      return socket;
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
    fire(name: string, ...args: unknown[]) {
      for (const fn of handlers.get(name) ?? []) fn(...args);
    },
    reset() {
      handlers.clear();
      socket.connect.mockClear();
      socket.disconnect.mockClear();
    },
  };
  return { socket, io: vi.fn(() => socket) };
});
vi.mock("socket.io-client", () => ({ io: fake.io }));

const { subscribeLive } = await import("./socket");

beforeEach(() => {
  fake.socket.reset();
  fake.io.mockClear();
  vi.stubGlobal("document", {
    visibilityState: "visible",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});
afterEach(() => vi.unstubAllGlobals());

const listener = () => ({ onEvent: vi.fn(), onStatus: vi.fn(), onReconnected: vi.fn() });

describe("shared live socket (M4-T3)", () => {
  it("shares one connection per identity and closes it with the last screen", () => {
    const a = subscribeLive("o1", listener());
    const b = subscribeLive("o1", listener());
    expect(fake.io).toHaveBeenCalledTimes(1);
    expect(fake.io).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/api/socket.io",
        addTrailingSlash: false,
        auth: { outletId: "o1" },
      }),
    );
    a();
    expect(fake.socket.disconnect).not.toHaveBeenCalled();
    b();
    expect(fake.socket.disconnect).toHaveBeenCalledTimes(1);
  });

  it("passes events on and refetches everything after a reconnect", () => {
    const l = listener();
    const leave = subscribeLive(undefined, l);
    fake.socket.fire("connect");
    expect(l.onStatus).toHaveBeenLastCalledWith("live");
    expect(l.onReconnected).not.toHaveBeenCalled();
    fake.socket.fire("menu.stockChanged", { outletId: "o1" });
    expect(l.onEvent).toHaveBeenCalledWith("menu.stockChanged");
    fake.socket.fire("disconnect", "transport close");
    fake.socket.fire("connect");
    expect(l.onReconnected).toHaveBeenCalledTimes(1);
    leave();
  });

  it("after a server cut-off, retries once and stops if the handshake refuses", () => {
    const l = listener();
    const leave = subscribeLive(undefined, l);
    fake.socket.fire("connect");
    fake.socket.fire("disconnect", "io server disconnect");
    expect(fake.socket.connect).toHaveBeenCalledTimes(1);
    fake.socket.fire(
      "connect_error",
      Object.assign(new Error("refused"), { data: { code: "UNAUTHENTICATED" } }),
    );
    expect(l.onStatus).toHaveBeenLastCalledWith("offline");
    expect(fake.socket.disconnect).toHaveBeenCalledTimes(1);
    fake.socket.fire("disconnect", "io server disconnect");
    expect(fake.socket.connect).toHaveBeenCalledTimes(1); // no loop
    leave();
  });
});
