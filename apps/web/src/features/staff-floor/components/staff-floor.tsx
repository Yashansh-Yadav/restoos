"use client";

import {
  allowedEvents,
  MANUAL_TABLE_EVENTS,
  type ManualTableEvent,
  type StaffFloor,
  type StaffFloorTable,
  type TableStatus,
} from "@restoos/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, Brush, ClipboardCheck, Loader2, ReceiptText, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { FloorGrid } from "@/features/floor/components/floor-grid";
import { cn } from "@/lib/utils";
import { changeTableStatus } from "../api";
import { floorActionError, staffFloorKey, useStaffFloor } from "../hooks";

// Staff floor view (M3-T4): every table coloured by status (DESIGN.md "Table status palette"),
// "My Tables" for butlers, badges for a ringing bell and orders waiting for approval. Tap a
// table → one big button moves it on (seat, guests left, clear, cleaned). English for now.

export const STATUS: Record<TableStatus, { word: string; tile: string; pill: string }> = {
  FREE: { word: "Free", tile: "", pill: "bg-background border border-input" },
  OCCUPIED: { word: "Seated", tile: "bg-secondary", pill: "bg-secondary" },
  ORDERED: {
    word: "Ordered",
    tile: "bg-info/12 border-l-[6px] border-l-info",
    pill: "bg-info/12 text-info",
  },
  BILL_REQUESTED: {
    word: "Bill",
    tile: "bg-warning/15 border-l-[6px] border-l-warning",
    pill: "bg-warning/15 text-warning",
  },
  PAID: {
    word: "Paid",
    tile: "bg-success/12 border-l-[6px] border-l-success",
    pill: "bg-success/12 text-success",
  },
  CLEANING: {
    word: "Cleaning",
    tile: "bg-muted border-dashed text-muted-foreground",
    pill: "bg-muted text-muted-foreground",
  },
};

const ACTION: Record<ManualTableEvent, { label: string; primary: boolean }> = {
  seat: { label: "Seat Guests", primary: true },
  unseat: { label: "Guests Left", primary: false },
  clear: { label: "Clear Table", primary: true },
  cleaned: { label: "Mark Cleaned", primary: true },
};

const manual = (status: TableStatus) =>
  allowedEvents(status).filter((e): e is ManualTableEvent =>
    (MANUAL_TABLE_EVENTS as readonly string[]).includes(e),
  );

function minutesAgo(iso: string | null): string | null {
  if (!iso) return null;
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return min < 1
    ? "just now"
    : min < 60
      ? `${min} min ago`
      : `${Math.floor(min / 60)} h ${min % 60} min ago`;
}

export function StaffFloorView({ initial }: { initial: StaffFloor }) {
  const client = useQueryClient();
  const { data: floor, isFetching, refetch } = useStaffFloor(initial);
  const all = floor.sections.flatMap((s) => s.tables);
  const hasMine = all.some((t) => t.mine);
  const [onlyMine, setOnlyMine] = useState(hasMine);
  const [sectionId, setSectionId] = useState<string | undefined>(
    floor.sections.find((s) => s.tables.some((t) => t.mine))?.id ?? floor.sections[0]?.id,
  );
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<ManualTableEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const section = floor.sections.find((s) => s.id === sectionId) ?? floor.sections[0];
  const open = all.find((t) => t.id === openId) ?? null;
  const mineOnly = onlyMine && hasMine;
  const alerts = (s: { tables: StaffFloorTable[] }) =>
    s.tables.filter((t) => (t.activeBell || t.pendingApproval) && (!mineOnly || t.mine)).length;

  async function act(t: StaffFloorTable, event: ManualTableEvent) {
    setBusy(event);
    setError(null);
    try {
      const res = await changeTableStatus(t.id, event);
      client.setQueryData<StaffFloor>(staffFloorKey, (prev) =>
        prev
          ? {
              sections: prev.sections.map((s) => ({
                ...s,
                tables: s.tables.map((x) =>
                  x.id === t.id
                    ? {
                        ...x,
                        status: res.status,
                        since:
                          res.status === "FREE"
                            ? null
                            : event === "seat"
                              ? new Date().toISOString()
                              : x.since,
                      }
                    : x,
                ),
              })),
            }
          : prev,
      );
      setOpenId(null);
      void client.invalidateQueries({ queryKey: staffFloorKey });
    } catch (err) {
      setError(floorActionError(err));
      void client.invalidateQueries({ queryKey: staffFloorKey });
    } finally {
      setBusy(null);
    }
  }

  if (floor.sections.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-[28px] leading-tight font-bold">Floor</h1>
        <p className="rounded-md bg-muted px-4 py-6 text-base text-body">
          No tables yet. The owner or manager sets up the floor first.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[28px] leading-tight font-bold">Floor</h1>
        <div className="flex items-center gap-2">
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
          <Button
            variant="secondary"
            size="icon"
            aria-label="Refresh"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            <RefreshCw
              className={cn(isFetching && "animate-spin motion-reduce:animate-none")}
              aria-hidden="true"
            />
          </Button>
        </div>
      </div>

      {floor.sections.length > 1 ? (
        <nav aria-label="Sections" className="-mx-4 sm:mx-0">
          <ul className="flex gap-1 overflow-x-auto overscroll-x-contain px-4 sm:px-0">
            {floor.sections.map((s) => {
              const isActive = s.id === section?.id;
              const n = alerts(s);
              return (
                <li key={s.id} className="shrink-0">
                  <button
                    type="button"
                    aria-current={isActive ? "true" : undefined}
                    onClick={() => setSectionId(s.id)}
                    className={cn(
                      "flex min-h-touch items-center gap-2 border-b-2 px-3 text-base whitespace-nowrap focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                      isActive
                        ? "border-foreground font-semibold"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {s.name}
                    {n > 0 ? (
                      <span className="rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground tabular-nums">
                        <span className="sr-only">, needs attention: </span>
                        {n}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}

      {section ? (
        <FloorGrid
          tables={section.tables}
          onSelect={(id) => {
            setError(null);
            setOpenId(id);
          }}
          tileLabel={(g) => {
            const t = section.tables.find((x) => x.id === g.id);
            if (!t) return "";
            return [
              STATUS[t.status].word,
              t.butlerName ? `with ${t.butlerName}` : null,
              t.activeBell ? "bell ringing" : null,
              t.pendingApproval ? "order waiting for approval" : null,
            ]
              .filter(Boolean)
              .join(", ");
          }}
          tileClassName={(g) => {
            const t = section.tables.find((x) => x.id === g.id);
            if (!t) return undefined;
            return cn(
              STATUS[t.status].tile,
              mineOnly && !t.mine && "opacity-40",
              t.activeBell &&
                "ring-4 ring-primary ring-offset-2 ring-offset-background motion-safe:animate-pulse",
            );
          }}
          tileExtra={(g) => {
            const t = section.tables.find((x) => x.id === g.id);
            if (!t) return null;
            return (
              <>
                <span className="text-[11px] leading-none font-semibold">
                  {STATUS[t.status].word}
                </span>
                {t.activeBell || t.pendingApproval ? (
                  <span className="absolute -top-2 -right-2 flex gap-0.5">
                    {t.activeBell ? (
                      <span className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Bell className="size-3.5" aria-hidden="true" />
                      </span>
                    ) : null}
                    {t.pendingApproval ? (
                      <span className="flex size-6 items-center justify-center rounded-full bg-info text-info-foreground">
                        <ClipboardCheck className="size-3.5" aria-hidden="true" />
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </>
            );
          }}
        />
      ) : null}

      <ul aria-label="Colours" className="flex flex-wrap gap-2 text-xs">
        {(Object.keys(STATUS) as TableStatus[]).map((s) => (
          <li key={s} className={cn("rounded-full px-2.5 py-1 font-semibold", STATUS[s].pill)}>
            {STATUS[s].word}
          </li>
        ))}
        <li className="flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 font-semibold text-primary-foreground">
          <Bell className="size-3" aria-hidden="true" /> Bell
        </li>
        <li className="flex items-center gap-1 rounded-full bg-info px-2.5 py-1 font-semibold text-info-foreground">
          <ClipboardCheck className="size-3" aria-hidden="true" /> To approve
        </li>
      </ul>

      <Sheet open={open !== null} onOpenChange={(o) => !o && setOpenId(null)}>
        {open ? (
          <SheetContent title={`Table ${open.label}`}>
            <div className="flex flex-col gap-5 pt-2">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-base">
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-sm font-semibold",
                      STATUS[open.status].pill,
                    )}
                  >
                    {STATUS[open.status].word}
                  </span>
                </dd>
                <dt className="text-muted-foreground">Butler</dt>
                <dd>{open.butlerName ?? "Not assigned"}</dd>
                {open.since ? (
                  <>
                    <dt className="text-muted-foreground">Seated</dt>
                    <dd className="tabular-nums">{minutesAgo(open.since)}</dd>
                  </>
                ) : null}
              </dl>
              {open.activeBell ? (
                <p className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm font-medium">
                  <Bell className="size-4 shrink-0" aria-hidden="true" /> The bell is ringing at
                  this table.
                </p>
              ) : null}
              {open.pendingApproval ? (
                <p className="flex items-center gap-2 rounded-md bg-info/12 px-3 py-2 text-sm font-medium">
                  <ClipboardCheck className="size-4 shrink-0" aria-hidden="true" /> An order is
                  waiting for approval.
                </p>
              ) : null}
              {error ? (
                <p role="alert" className="text-sm font-medium text-destructive">
                  {error}
                </p>
              ) : null}
              <div className="flex flex-col gap-2">
                {manual(open.status).map((event) => (
                  <Button
                    key={event}
                    size="staff"
                    variant={ACTION[event].primary ? "default" : "secondary"}
                    disabled={busy !== null}
                    onClick={() => void act(open, event)}
                  >
                    {busy === event ? (
                      <Loader2 className="animate-spin" aria-hidden="true" />
                    ) : event === "clear" || event === "cleaned" ? (
                      <Brush aria-hidden="true" />
                    ) : null}
                    {ACTION[event].label}
                  </Button>
                ))}
                {manual(open.status).length === 0 ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ReceiptText className="size-4 shrink-0" aria-hidden="true" />
                    Orders and bills move this table on.
                  </p>
                ) : null}
              </div>
            </div>
          </SheetContent>
        ) : null}
      </Sheet>
    </div>
  );
}
