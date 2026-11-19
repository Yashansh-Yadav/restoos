"use client";

import { isMovable, type MovedTable, type StaffFloorTable } from "@restoos/shared";
import { useQuery } from "@tanstack/react-query";
import { ArrowRightLeft, Combine, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SheetContent } from "@/components/ui/sheet";
import { getStaffFloor } from "@/features/staff-floor/api";
import { STATUS } from "@/features/staff-floor/components/staff-floor";
import { staffFloorKey } from "@/features/staff-floor/hooks";
import { cn } from "@/lib/utils";
import { moveTable } from "../api";
import { orderError } from "../hooks";

// Move guests / join tables (M5-T7; cashier, manager, owner). "Move to a Free Table" takes the
// whole sitting (orders, kitchen tickets, waiting guest orders) to a free table; "Join Another
// Table" adds this table's orders to a table with guests and frees this one. Pick → confirm.
// Taps from the floor: table → Move → target → confirm (4).

type Kind = "transfer" | "merge";

export function MoveSheet({
  table,
  onMoved,
}: {
  table: { id: string; label: string };
  onMoved: (moved: MovedTable) => void;
}) {
  const [kind, setKind] = useState<Kind>("transfer");
  const [target, setTarget] = useState<StaffFloorTable | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: floor } = useQuery({ queryKey: staffFloorKey, queryFn: () => getStaffFloor() });

  const candidates = (floor?.sections ?? [])
    .map((s) => ({
      ...s,
      tables: s.tables.filter(
        (t) =>
          t.id !== table.id && (kind === "transfer" ? t.status === "FREE" : isMovable(t.status)),
      ),
    }))
    .filter((s) => s.tables.length > 0);

  async function confirm() {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      onMoved(await moveTable(table.id, { toTableId: target.id, kind }));
    } catch (err) {
      setError(orderError(err));
      setBusy(false);
    }
  }

  return (
    <SheetContent title={`Move ${table.label}`}>
      <div className="flex flex-col gap-4 pt-2">
        <div role="tablist" aria-label="Move or join" className="grid grid-cols-2 gap-1">
          {(
            [
              ["transfer", "Move to a Free Table", ArrowRightLeft],
              ["merge", "Join Another Table", Combine],
            ] as const
          ).map(([value, text, Icon]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={kind === value}
              onClick={() => {
                setKind(value);
                setTarget(null);
                setError(null);
              }}
              className={cn(
                "flex min-h-touch items-center justify-center gap-2 rounded-md border px-2 text-sm font-semibold",
                kind === value
                  ? "border-foreground bg-foreground text-background"
                  : "border-input text-muted-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {text}
            </button>
          ))}
        </div>

        {!floor ? (
          <p className="flex items-center gap-2 text-base text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading tables…
          </p>
        ) : candidates.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-base text-muted-foreground">
            {kind === "transfer" ? "No free tables right now." : "No other tables have guests."}
          </p>
        ) : (
          <div role="tabpanel" className="flex flex-col gap-3">
            {candidates.map((s) => (
              <section key={s.id} aria-label={s.name} className="flex flex-col gap-2">
                <h3 className="text-sm font-medium text-muted-foreground">{s.name}</h3>
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {s.tables.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        aria-pressed={target?.id === t.id}
                        aria-label={`${t.label}, ${STATUS[t.status].word}${t.butlerName ? `, with ${t.butlerName}` : ""}`}
                        onClick={() => {
                          setTarget(t);
                          setError(null);
                        }}
                        className={cn(
                          "flex min-h-touch-staff w-full flex-col items-start justify-center rounded-md border-2 px-3 py-2 text-left",
                          STATUS[t.status].tile,
                          target?.id === t.id ? "border-foreground" : "border-border",
                        )}
                      >
                        <span className="text-xl leading-none font-bold" translate="no">
                          {t.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {STATUS[t.status].word}
                          {t.butlerName ? ` · ${t.butlerName}` : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {target ? (
          <p className="text-base" aria-live="polite">
            {kind === "transfer"
              ? `Move ${table.label}'s guests and orders to ${target.label}?`
              : `Add ${table.label}'s orders to ${target.label}? ${table.label} becomes free.`}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}

        <Button size="staff" disabled={!target || busy} onClick={() => void confirm()}>
          {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {target
            ? kind === "transfer"
              ? `Move to ${target.label}`
              : `Join ${target.label}`
            : "Choose a Table"}
        </Button>
      </div>
    </SheetContent>
  );
}
