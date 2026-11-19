"use client";

import { OUTLET_EVENT_NAMES, type ServerToClientEvents } from "@restoos/shared";
import { io, type Socket } from "socket.io-client";

// One live connection per browser tab and identity (M4-T3): the staff device session, or the
// owner working in one outlet, or a guest's phone on a table QR (M5-T6a: auth.qrToken → the
// table room + the outlet's public room). Screens share it (reference-counted) and it closes
// when the last one unmounts. Same origin as the API (/api/socket.io, no trailing slash — see M4-T1).

export type LiveStatus = "connecting" | "live" | "offline";
type Listener = {
  onEvent: (name: (typeof OUTLET_EVENT_NAMES)[number]) => void;
  onStatus: (s: LiveStatus) => void;
  onReconnected: () => void;
};

type Entry = {
  socket: Socket<ServerToClientEvents>;
  status: LiveStatus;
  listeners: Set<Listener>;
};

const entries = new Map<string, Entry>();
const PATH = "/api/socket.io";

/** Codes the handshake uses to refuse (M4-T1): retrying won't help until the user signs in. */
const REFUSED = new Set([
  "UNAUTHENTICATED",
  "OUTLET_FORBIDDEN",
  "OUTLET_REQUIRED",
  "TABLE_NOT_FOUND",
  "ONBOARDING_REQUIRED",
]);

function setStatus(entry: Entry, status: LiveStatus) {
  if (entry.status === status) return;
  entry.status = status;
  for (const l of entry.listeners) l.onStatus(status);
}

function create(key: string, auth: Record<string, string>): Entry {
  const socket: Socket<ServerToClientEvents> = io({
    path: PATH,
    addTrailingSlash: false,
    withCredentials: true,
    auth,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 10_000,
  });
  const entry: Entry = { socket, status: "connecting", listeners: new Set() };
  let connectedBefore = false;
  let retriedAfterCutOff = false;

  socket.on("connect", () => {
    setStatus(entry, "live");
    // Back after a drop: events may have been missed, so refetch everything live.
    if (connectedBefore) for (const l of entry.listeners) l.onReconnected();
    connectedBefore = true;
    retriedAfterCutOff = false;
  });
  socket.on("disconnect", (reason) => {
    setStatus(entry, "offline");
    // The server cut us off (sign-out, new QR — M4-T2). Socket.io won't retry by itself; try once
    // in case the session is still good (e.g. the same person on another device).
    if (reason === "io server disconnect" && !retriedAfterCutOff) {
      retriedAfterCutOff = true;
      setStatus(entry, "connecting");
      socket.connect();
    }
  });
  socket.on("connect_error", (err: Error & { data?: { code?: string } }) => {
    const refused = err.data?.code !== undefined && REFUSED.has(err.data.code);
    setStatus(entry, refused ? "offline" : "connecting");
    if (refused) socket.disconnect(); // no retry loop until the user signs in again
  });
  for (const name of OUTLET_EVENT_NAMES) {
    socket.on(name, () => {
      for (const l of entry.listeners) l.onEvent(name);
    });
  }
  entries.set(key, entry);
  return entry;
}

/** Joins (or opens) the tab's connection; returns a function that leaves it. */
export function subscribeLive(outletId: string | undefined, listener: Listener): () => void {
  return join(outletId ?? "device", outletId ? { outletId } : {}, listener);
}

/** A guest's phone on the table page (no login): live menu, stock and, later, bell/bill. */
export function subscribeTable(qrToken: string, listener: Listener): () => void {
  return join(`table:${qrToken}`, { qrToken }, listener);
}

function join(key: string, auth: Record<string, string>, listener: Listener): () => void {
  const entry = entries.get(key) ?? create(key, auth);
  entry.listeners.add(listener);
  listener.onStatus(entry.status);
  // A tablet waking up: reconnect now rather than after the backoff.
  const onVisible = () => {
    if (
      document.visibilityState === "visible" &&
      entry.socket.disconnected &&
      entry.status !== "offline"
    ) {
      entry.socket.connect();
    }
  };
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    entry.listeners.delete(listener);
    if (entry.listeners.size === 0) {
      entry.socket.disconnect();
      entries.delete(key);
    }
  };
}
