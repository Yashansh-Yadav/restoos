"use client";

import { KOT_STAGES, type KitchenBoard, type KitchenKot, type KotStage } from "@restoos/shared";
import { useQueryClient } from "@tanstack/react-query";
import { AlarmClock, Bell, BellOff, ChefHat, Loader2, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useOutletSocket } from "@/features/realtime/use-outlet-socket";
import { cn } from "@/lib/utils";
import { moveKot } from "../api";
import { playChime, setSoundWanted, soundReady, unlockSound } from "../chime";
import { kitchenError, kitchenKey, useKitchenBoard } from "../hooks";

// Kitchen display (M5-T3): tickets in New / Preparing / Ready, oldest first. One big button
// moves a whole ticket on; "Undo" puts a mis-tap back. Each card shows how long it has waited
// and turns to the warning style (with a "Late" label) after the outlet's late time. A chime
// plays for each new ticket once sound has been turned on. English for now.

const COLUMN: Record<KotStage, { title: string; next?: KotStage; action?: string }> = {
  NEW: { title: "New", next: "PREPARING", action: "Start Cooking" },
  PREPARING: { title: "Preparing", next: "READY", action: "Mark Ready" },
  READY: { title: "Ready" },
};
const PREVIOUS: Record<KotStage, KotStage | undefined> = {
  NEW: undefined,
  PREPARING: "NEW",
  READY: "PREPARING",
};

/** "now", refreshed every 30 s so the timers move. */
function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function KitchenBoardView({ initial }: { initial: KitchenBoard }) {
  const client = useQueryClient();
  const { data: board } = useKitchenBoard(initial);
  const { status: live } = useOutletSocket();
  const now = useNow();
  const [tab, setTab] = useState<KotStage>("NEW");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ kot: KitchenKot; to: KotStage; label: string } | null>(null);
  const [sound, setSound] = useState<"off" | "on">("off");

  // Sound: browsers need one tap per page load before a page may play audio.
  async function turnSoundOn() {
    const ok = await unlockSound();
    setSoundWanted(ok);
    setSound(ok ? "on" : "off");
    if (ok) playChime();
  }

  // Chime once for every ticket that wasn't on the board before (not on first load).
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = new Set(board.kots.map((k) => k.id));
    if (known.current && board.kots.some((k) => !known.current?.has(k.id)) && soundReady()) {
      playChime();
    }
    known.current = ids;
  }, [board]);

  // Undo is offered for 5 seconds after a move.
  useEffect(() => {
    if (!undo) return;
    const t = window.setTimeout(() => setUndo(null), 5_000);
    return () => window.clearTimeout(t);
  }, [undo]);

  async function move(kot: KitchenKot, to: KotStage, isUndo = false) {
    setBusy(kot.id);
    setError(null);
    // Show it in the new column straight away; the live refresh confirms it.
    void client.cancelQueries({ queryKey: kitchenKey });
    client.setQueryData<KitchenBoard>(kitchenKey, (prev) =>
      prev
        ? { ...prev, kots: prev.kots.map((k) => (k.id === kot.id ? { ...k, stage: to } : k)) }
        : prev,
    );
    try {
      await moveKot(kot.id, to);
      const back = PREVIOUS[to] === kot.stage ? kot.stage : undefined;
      setUndo(
        isUndo || !back
          ? null
          : {
              kot: { ...kot, stage: to },
              to: back,
              label: `KOT #${kot.number} → ${COLUMN[to].title}`,
            },
      );
    } catch (err) {
      setError(kitchenError(err));
    } finally {
      setBusy(null);
      void client.invalidateQueries({ queryKey: kitchenKey });
    }
  }

  const byStage = (stage: KotStage) => board.kots.filter((k) => k.stage === stage);

  return (
    <div className="flex min-h-dvh flex-col gap-4 px-4 pt-4 pb-28 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ChefHat className="size-7" aria-hidden="true" />
          <h1 className="text-[28px] leading-tight font-bold">Kitchen</h1>
          <span
            role="status"
            className="ml-2 flex items-center gap-1.5 text-sm font-medium text-muted-foreground"
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
        {sound === "on" ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setSoundWanted(false);
              setSound("off");
            }}
          >
            <Bell aria-hidden="true" />
            Sound On
          </Button>
        ) : (
          <Button size="sm" onClick={() => void turnSoundOn()}>
            <BellOff aria-hidden="true" />
            Tap to Turn On Sound
          </Button>
        )}
      </header>

      {/* Phones: one column at a time. */}
      <div
        role="tablist"
        aria-label="Ticket columns"
        className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1 md:hidden"
      >
        {KOT_STAGES.map((s) => (
          <button
            key={s}
            role="tab"
            type="button"
            aria-selected={tab === s}
            onClick={() => setTab(s)}
            className={cn(
              "min-h-touch rounded-sm text-sm font-semibold tabular-nums focus-visible:outline-2 focus-visible:outline-ring",
              tab === s ? "bg-background shadow-sm" : "text-muted-foreground",
            )}
          >
            {COLUMN[s].title} {byStage(s).length}
          </button>
        ))}
      </div>

      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      <div className="grid flex-1 gap-4 md:grid-cols-3">
        {KOT_STAGES.map((stage) => {
          const kots = byStage(stage);
          return (
            <section
              key={stage}
              aria-labelledby={`col-${stage}`}
              className={cn("flex flex-col gap-3", stage !== tab && "hidden md:flex")}
            >
              <h2
                id={`col-${stage}`}
                className="hidden items-center justify-between text-base font-semibold md:flex"
              >
                {COLUMN[stage].title}
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-sm tabular-nums">
                  {kots.length}
                </span>
              </h2>
              {kots.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                  {stage === "NEW"
                    ? "No new tickets."
                    : stage === "PREPARING"
                      ? "Nothing cooking."
                      : "Nothing waiting."}
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {kots.map((k) => {
                    const minutes = Math.max(
                      0,
                      Math.floor((now - new Date(k.createdAt).getTime()) / 60_000),
                    );
                    const late = stage !== "READY" && minutes >= board.lateAfterMinutes;
                    const next = COLUMN[stage].next;
                    return (
                      <li key={k.id}>
                        <article
                          aria-label={`KOT ${k.number}${k.tableLabel ? `, table ${k.tableLabel}` : ""}, ${minutes} minutes${late ? ", late" : ""}`}
                          className={cn(
                            "flex flex-col gap-3 rounded-md border-2 bg-card p-4",
                            late ? "border-warning bg-warning/10" : "border-border",
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex flex-col">
                              <span
                                className="text-3xl leading-none font-bold tabular-nums"
                                translate="no"
                              >
                                #{k.number}
                              </span>
                              <span className="mt-1 text-base font-semibold" translate="no">
                                {k.tableLabel ? `Table ${k.tableLabel}` : "Takeaway"}
                              </span>
                            </div>
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums",
                                late ? "bg-warning text-warning-foreground" : "bg-muted",
                              )}
                            >
                              <AlarmClock className="size-4" aria-hidden="true" />
                              {late ? `Late · ${minutes} min` : `${minutes} min`}
                            </span>
                          </div>
                          <ul className="flex flex-col gap-1.5">
                            {k.items
                              .filter((i) => i.status !== "SERVED")
                              .map((i) =>
                                i.status === "VOIDED" ? (
                                  // M5-T5: a void stays on the ticket, struck, so the cook stops.
                                  <li
                                    key={i.id}
                                    className="flex items-center gap-2 text-lg leading-snug text-muted-foreground"
                                  >
                                    <span className="line-through">
                                      <span className="font-bold tabular-nums">{i.quantity} ×</span>{" "}
                                      {i.name}
                                    </span>
                                    <span className="rounded-sm bg-destructive px-1.5 py-0.5 text-sm font-bold text-destructive-foreground">
                                      VOID
                                    </span>
                                  </li>
                                ) : (
                                  <li key={i.id} className="text-lg leading-snug">
                                    <span className="font-bold tabular-nums">{i.quantity} ×</span>{" "}
                                    {i.name}
                                    {i.addOns.length > 0 ? (
                                      <span className="block text-base text-muted-foreground">
                                        + {i.addOns.join(", ")}
                                      </span>
                                    ) : null}
                                    {i.note ? (
                                      <span className="mt-0.5 block rounded-sm bg-warning/15 px-2 py-0.5 text-base font-medium italic">
                                        “{i.note}”
                                      </span>
                                    ) : null}
                                  </li>
                                ),
                              )}
                          </ul>
                          {next ? (
                            <Button
                              size="staff"
                              disabled={busy === k.id}
                              onClick={() => void move(k, next)}
                            >
                              {busy === k.id ? (
                                <Loader2 className="animate-spin" aria-hidden="true" />
                              ) : null}
                              {COLUMN[stage].action}
                            </Button>
                          ) : (
                            <p className="text-sm font-medium text-muted-foreground">
                              Waiting for the butler
                            </p>
                          )}
                        </article>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {undo ? (
        <div
          role="status"
          className="fixed inset-x-4 bottom-4 z-20 mx-auto flex max-w-md items-center justify-between gap-3 rounded-md bg-foreground px-4 py-2 text-background shadow-lg"
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        >
          <span className="text-base font-medium">{undo.label}</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const u = undo;
              setUndo(null);
              void move(u.kot, u.to, true);
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
