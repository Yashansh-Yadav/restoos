"use client";

import type { AssignmentBoard, AssignmentButler } from "@restoos/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, UserRound } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FloorGrid } from "@/features/floor/components/floor-grid";
import { cn } from "@/lib/utils";
import { useOutletSocket } from "@/features/realtime/use-outlet-socket";
import { assignSection, assignTable } from "../api";
import { assignError, boardKey, useAssignmentBoard } from "../hooks";

// Assign butlers to tables for this shift (M3-T3): tap a butler, then tap tables — one tap per
// table, saved at once. Tap one of their tables again to take it off. Used by the manager on a
// tablet (/staff/assign) and the owner on the web (/owner/floor/assign, with outletId).

const firstName = (name: string) => name.split(/\s+/)[0] ?? name;

export function AssignBoard({
  initial,
  outletId,
}: {
  initial: AssignmentBoard;
  outletId?: string;
}) {
  const client = useQueryClient();
  const key = boardKey(outletId);
  const { data: board } = useAssignmentBoard(initial, outletId);
  useOutletSocket({ outletId }); // live: butlers starting shifts, other managers' changes (M4-T3)
  const onShift = board.butlers.filter((b) => b.onShift);
  const offShift = board.butlers.filter((b) => !b.onShift);
  const [butlerId, setButlerId] = useState<string | undefined>(onShift[0]?.id);
  const [sectionId, setSectionId] = useState<string | undefined>(board.sections[0]?.id);
  const [busySection, setBusySection] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const butler = onShift.find((b) => b.id === butlerId);
  const section = board.sections.find((s) => s.id === sectionId) ?? board.sections[0];
  const nameOf = new Map(board.butlers.map((b) => [b.id, b.name]));
  const labelOf = new Map(board.sections.flatMap((s) => s.tables.map((t) => [t.id, t.label])));
  const holderOf = new Map(
    board.sections.flatMap((s) => s.tables.map((t) => [t.id, t.butlerId] as const)),
  );

  /** Optimistic: show the change now, roll back with a message if the save fails. */
  function patch(tableIds: string[], to: string | null) {
    const ids = new Set(tableIds);
    client.setQueryData<AssignmentBoard>(key, (prev) =>
      prev
        ? {
            butlers: prev.butlers.map((b) => ({
              ...b,
              tableIds:
                b.id === to
                  ? [...new Set([...b.tableIds, ...tableIds])]
                  : b.tableIds.filter((id) => !ids.has(id)),
            })),
            sections: prev.sections.map((s) => ({
              ...s,
              tables: s.tables.map((t) => (ids.has(t.id) ? { ...t, butlerId: to } : t)),
            })),
          }
        : prev,
    );
  }
  const resync = () => client.invalidateQueries({ queryKey: key });

  function tapTable(tableId: string) {
    if (!butler) return;
    const to = holderOf.get(tableId) === butler.id ? null : butler.id;
    setError(null);
    patch([tableId], to);
    assignTable(tableId, to, outletId).catch((err: unknown) => {
      setError(assignError(err));
      void resync();
    });
  }

  async function giveSection() {
    if (!butler || !section) return;
    setBusySection(true);
    setError(null);
    patch(
      section.tables.map((t) => t.id),
      butler.id,
    );
    try {
      await assignSection(section.id, butler.id, outletId);
    } catch (err) {
      setError(assignError(err));
      await resync();
    } finally {
      setBusySection(false);
    }
  }

  const usual = (b: AssignmentButler) =>
    b.usualTableIds
      .map((id) => labelOf.get(id))
      .filter(Boolean)
      .join(", ");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-[28px] leading-tight font-bold">Assign Tables</h1>
        <p className="text-sm text-pretty text-muted-foreground">
          Tap a butler, then tap their tables. Tap a table again to take it off.
        </p>
      </div>

      {board.butlers.length === 0 ? (
        <p className="rounded-md bg-muted px-4 py-6 text-base text-body">
          No butlers yet. Add staff with the Butler role first.
        </p>
      ) : (
        <section aria-labelledby="butlers-heading" className="flex flex-col gap-2">
          <h2 id="butlers-heading" className="text-sm font-medium text-muted-foreground">
            On Shift
          </h2>
          {onShift.length === 0 ? (
            <p className="rounded-md bg-muted px-4 py-4 text-sm text-body">
              No butler has started a shift yet. Tables can be given once they sign in — they get
              yesterday&apos;s tables back automatically.
            </p>
          ) : (
            <div
              role="group"
              aria-label="Choose a butler"
              className="-mx-4 flex gap-2 overflow-x-auto overscroll-x-contain px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
            >
              {onShift.map((b) => {
                const active = b.id === butler?.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setButlerId(b.id)}
                    className={cn(
                      "flex min-h-touch-staff shrink-0 [touch-action:manipulation] items-center gap-3 rounded-md border px-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      active
                        ? "border-2 border-primary bg-primary/10"
                        : "border-input hover:bg-muted",
                    )}
                  >
                    <UserRound className="size-5 shrink-0" aria-hidden="true" />
                    <span className="flex flex-col">
                      <span className="text-base font-semibold">{b.name}</span>
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {b.tableIds.length} {b.tableIds.length === 1 ? "table" : "tables"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {offShift.length > 0 ? (
            <p className="text-sm text-pretty text-muted-foreground">
              <span className="font-medium">Not on shift:</span>{" "}
              {offShift
                .map((b) => (usual(b) ? `${b.name} (usually ${usual(b)})` : b.name))
                .join(" · ")}
            </p>
          ) : null}
        </section>
      )}

      {board.sections.length === 0 ? (
        <p className="rounded-md bg-muted px-4 py-6 text-base text-body">
          No tables yet. Set up the floor first.
        </p>
      ) : (
        <>
          {board.sections.length > 1 ? (
            <nav aria-label="Sections" className="-mx-4 sm:mx-0">
              <ul className="flex gap-1 overflow-x-auto overscroll-x-contain px-4 sm:px-0">
                {board.sections.map((s) => {
                  const isActive = s.id === section?.id;
                  return (
                    <li key={s.id} className="shrink-0">
                      <button
                        type="button"
                        aria-current={isActive ? "true" : undefined}
                        onClick={() => setSectionId(s.id)}
                        className={cn(
                          "flex min-h-touch items-center border-b-2 px-3 text-base whitespace-nowrap focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                          isActive
                            ? "border-foreground font-semibold"
                            : "border-transparent text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {s.name}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ) : null}

          {section && section.tables.length > 0 ? (
            <FloorGrid
              tables={section.tables}
              onSelect={tapTable}
              isPressed={(t) => butler !== undefined && holderOf.get(t.id) === butler.id}
              tileLabel={(t) => {
                const holder = holderOf.get(t.id);
                return holder ? `with ${nameOf.get(holder) ?? "someone"}` : "free";
              }}
              tileClassName={(t) => {
                const holder = holderOf.get(t.id);
                if (butler && holder === butler.id) return "border-primary bg-primary/10";
                return holder ? "bg-muted" : undefined;
              }}
              tileExtra={(t) => {
                const holder = holderOf.get(t.id);
                return holder ? (
                  <span className="max-w-full truncate px-1 text-xs font-semibold">
                    {firstName(nameOf.get(holder) ?? "")}
                  </span>
                ) : null;
              }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">No tables in this section.</p>
          )}

          {error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}

          {butler && section && section.tables.length > 0 ? (
            <Button
              variant="secondary"
              size="staff"
              disabled={busySection}
              onClick={() => void giveSection()}
            >
              {busySection ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Give All of {section.name} to {firstName(butler.name)}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
