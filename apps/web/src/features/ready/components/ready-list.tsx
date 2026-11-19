"use client";

import type { ReadyKot, ReadyList } from "@restoos/shared";
import { useQueryClient } from "@tanstack/react-query";
import { HandPlatter, Loader2, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useOutletSocket } from "@/features/realtime/use-outlet-socket";
import { cn } from "@/lib/utils";
import { markServed } from "../api";
import { readyKey, useReadyList } from "../hooks";

// Ready to Serve (M5-T4): food the kitchen has marked ready, oldest first. Butlers start on
// their own tables; one big "Served" per ticket (with a 5-second Undo) takes it off the kitchen
// board. Live via sockets. English for now (staff Hindi: phase 2).

function minutesSince(iso: string, now: number) {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
}

export function ReadyListView({ initial }: { initial: ReadyList }) {
  const client = useQueryClient();
  const { data } = useReadyList(initial);
  const { status: live } = useOutletSocket();
  const hasMine = data.kots.some((k) => k.mine);
  const [onlyMine, setOnlyMine] = useState(hasMine);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<ReadyKot | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    if (!undo) return;
    const t = window.setTimeout(() => setUndo(null), 5_000);
    return () => window.clearTimeout(t);
  }, [undo]);

  const shown = onlyMine && hasMine ? data.kots.filter((k) => k.mine) : data.kots;

  async function serve(kot: ReadyKot, served: boolean) {
    setBusy(kot.kotId);
    setError(null);
    if (served) {
      void client.cancelQueries({ queryKey: readyKey });
      client.setQueryData<ReadyList>(readyKey, (prev) =>
        prev ? { kots: prev.kots.filter((k) => k.kotId !== kot.kotId) } : prev,
      );
    }
    try {
      await markServed(kot.kotId, served);
      setUndo(served ? kot : null);
    } catch (err) {
      setError(
        err instanceof Error &&
          "status" in err &&
          typeof err.status === "number" &&
          err.status < 500
          ? err.message
          : "Couldn't save. Check the connection and tap again.",
      );
    } finally {
      setBusy(null);
      void client.invalidateQueries({ queryKey: readyKey });
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[28px] leading-tight font-bold">Ready to Serve</h1>
        <div className="flex items-center gap-3">
          {hasMine ? (
            <div
              role="group"
              aria-label="Show"
              className="flex rounded-md border border-input p-0.5"
            >
              {(
                [
                  [true, "My Tables"],
                  [false, "All"],
                ] as const
              ).map(([value, text]) => (
                <button
                  key={text}
                  type="button"
                  aria-pressed={onlyMine === value}
                  onClick={() => setOnlyMine(value)}
                  className={cn(
                    "min-h-touch [touch-action:manipulation] rounded-sm px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring",
                    onlyMine === value ? "bg-foreground text-background" : "text-muted-foreground",
                  )}
                >
                  {text}
                </button>
              ))}
            </div>
          ) : null}
          <span
            role="status"
            className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground"
          >
            <span
              aria-hidden="true"
              className={cn(
                "size-2 rounded-full",
                live === "live"
                  ? "bg-success"
                  : live === "connecting"
                    ? "bg-warning"
                    : "bg-muted-foreground",
              )}
            />
            {live === "live" ? "Live" : live === "connecting" ? "Reconnecting…" : "Offline"}
          </span>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      {shown.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-base text-muted-foreground">
          Nothing waiting — the kitchen&apos;s ready dishes appear here.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((k) => (
            <li key={k.kotId}>
              <article
                aria-label={`Table ${k.table?.label ?? "takeaway"}, KOT ${k.number}`}
                className="flex flex-col gap-3 rounded-md border-2 border-success/60 bg-success/5 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col">
                    <span className="text-2xl leading-none font-bold" translate="no">
                      {k.table ? `Table ${k.table.label}` : "Takeaway"}
                    </span>
                    <span
                      className="mt-1 text-sm text-muted-foreground tabular-nums"
                      translate="no"
                    >
                      KOT #{k.number}
                      {k.butlerName ? ` · ${k.butlerName}` : ""}
                    </span>
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-sm font-semibold tabular-nums">
                    ready {minutesSince(k.readySince, now)} min
                  </span>
                </div>
                <ul className="flex flex-col gap-1">
                  {k.items.map((i) => (
                    <li key={i.id} className="text-lg leading-snug">
                      <span className="font-bold tabular-nums">{i.quantity} ×</span> {i.name}
                      {i.addOns.length > 0 ? (
                        <span className="block text-base text-muted-foreground">
                          + {i.addOns.join(", ")}
                        </span>
                      ) : null}
                      {i.note ? (
                        <span className="block text-base text-muted-foreground italic">
                          “{i.note}”
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <Button
                  size="staff"
                  disabled={busy === k.kotId}
                  onClick={() => void serve(k, true)}
                >
                  {busy === k.kotId ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : (
                    <HandPlatter aria-hidden="true" />
                  )}
                  Served
                </Button>
              </article>
            </li>
          ))}
        </ul>
      )}

      {undo ? (
        <div
          role="status"
          className="fixed inset-x-4 bottom-4 z-20 mx-auto flex max-w-md items-center justify-between gap-3 rounded-md bg-foreground px-4 py-2 text-background shadow-lg"
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        >
          <span className="text-base font-medium">
            KOT #{undo.number} served{undo.table ? ` · ${undo.table.label}` : ""}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const u = undo;
              setUndo(null);
              void serve(u, false);
            }}
          >
            <Undo2 aria-hidden="true" />
            Undo
          </Button>
        </div>
      ) : null}
    </div>
  );
}
