"use client";

import { FLOOR_COLUMNS, type Floor, type FloorTable } from "@restoos/shared";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  LayoutGrid,
  Loader2,
  Pencil,
  Plus,
  QrCode,
  Rows3,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { saveLayout } from "../api";
import { floorError, useFloor, useRefreshFloor } from "../hooks";
import { FloorGrid } from "./floor-grid";
import { AddTablesSheet, PrintSheet, SectionsSheet, TableSheet } from "./floor-sheets";

// /owner/floor (M3-T1): sections as tabs; each is a grid. Drag tiles, or select one and use the
// arrow buttons / keys; "Save Layout" stores all moves at once. English for now.

type Open =
  | { kind: "sections" }
  | { kind: "add" }
  | { kind: "print" }
  | { kind: "table"; table: FloorTable }
  | null;
type Pos = { posX: number; posY: number; sectionId: string };

export function FloorEditor({ outletId, initial }: { outletId: string; initial: Floor }) {
  const { data: floor } = useFloor(outletId, initial);
  const refresh = useRefreshFloor(outletId);
  const [activeId, setActiveId] = useState<string | undefined>(floor.sections[0]?.id);
  const [draft, setDraft] = useState<Map<string, Pos>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState<Open>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = floor.sections.find((s) => s.id === activeId) ?? floor.sections[0];
  const dirty = draft.size > 0;

  // Tables of the active section, with unsaved moves applied.
  const tables = useMemo(
    () =>
      (active?.tables ?? []).map((t) => {
        const d = draft.get(t.id);
        return d ? { ...t, posX: d.posX, posY: d.posY } : t;
      }),
    [active, draft],
  );
  const selected = tables.find((t) => t.id === selectedId) ?? null;
  const rows = Math.max(4, ...tables.map((t) => t.posY + 2));

  // Unsaved layout: warn before leaving the page.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /** Move a table to a cell; if another table is there, they swap. */
  function moveTo(id: string, posX: number, posY: number) {
    if (!active) return;
    const x = Math.min(Math.max(posX, 0), FLOOR_COLUMNS - 1);
    const y = Math.min(Math.max(posY, 0), rows);
    const me = tables.find((t) => t.id === id);
    if (!me || (me.posX === x && me.posY === y)) return;
    const other = tables.find((t) => t.id !== id && t.posX === x && t.posY === y);
    setDraft((prev) => {
      const next = new Map(prev);
      next.set(id, { posX: x, posY: y, sectionId: active.id });
      if (other) next.set(other.id, { posX: me.posX, posY: me.posY, sectionId: active.id });
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await saveLayout(
        outletId,
        [...draft].map(([id, p]) => ({ id, ...p })),
      );
      await refresh();
      setDraft(new Map());
    } catch (err) {
      setError(floorError(err));
    } finally {
      setSaving(false);
    }
  }

  const close = () => setOpen(null);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] leading-tight font-bold">Floor & Tables</h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            {floor.sections.reduce((n, s) => n + s.tables.length, 0)} tables in{" "}
            {floor.sections.length} {floor.sections.length === 1 ? "section" : "sections"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {floor.sections.some((s) => s.tables.length > 0) ? (
            <Button variant="secondary" size="sm" onClick={() => setOpen({ kind: "print" })}>
              <QrCode aria-hidden="true" />
              Print QR Codes
            </Button>
          ) : null}
          <Button variant="secondary" size="sm" onClick={() => setOpen({ kind: "sections" })}>
            <Rows3 aria-hidden="true" />
            Sections
          </Button>
          <Button
            size="sm"
            disabled={floor.sections.length === 0}
            onClick={() => setOpen({ kind: "add" })}
          >
            <Plus aria-hidden="true" />
            Add Tables
          </Button>
        </div>
      </div>

      {floor.sections.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border px-6 py-12 text-center">
          <LayoutGrid className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-base font-semibold">Set up your floor</p>
          <p className="max-w-sm text-sm text-pretty text-muted-foreground">
            Add a section like Main Hall or Terrace, then add tables T1–T20 in one go. Arrange them
            to match your room.
          </p>
          <Button onClick={() => setOpen({ kind: "sections" })}>
            <Plus aria-hidden="true" />
            Add Your First Section
          </Button>
        </div>
      ) : (
        <>
          <nav aria-label="Sections" className="-mx-4 sm:mx-0">
            <ul className="flex gap-1 overflow-x-auto overscroll-x-contain px-4 sm:px-0">
              {floor.sections.map((s) => {
                const isActive = s.id === active?.id;
                return (
                  <li key={s.id} className="shrink-0">
                    <button
                      type="button"
                      aria-current={isActive ? "true" : undefined}
                      onClick={() => {
                        setActiveId(s.id);
                        setSelectedId(null);
                      }}
                      className={cn(
                        "flex min-h-touch items-center gap-2 border-b-2 px-3 text-base whitespace-nowrap focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                        isActive
                          ? "border-foreground font-semibold"
                          : "border-transparent text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {s.name}
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {s.tables.length}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {tables.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border px-6 py-10 text-center">
              <p className="text-base font-semibold">No tables in {active?.name} yet</p>
              <Button variant="secondary" onClick={() => setOpen({ kind: "add" })}>
                <Plus aria-hidden="true" />
                Add Tables
              </Button>
            </div>
          ) : (
            <>
              <p className="text-sm text-pretty text-muted-foreground">
                Drag tables to match your room, or tap one and use the arrows.
              </p>
              <FloorGrid
                tables={tables}
                selectedId={selectedId}
                onSelect={(id) => setSelectedId((cur) => (cur === id ? null : id))}
                onDrop={moveTo}
                onKeyMove={(id, dx, dy) => {
                  const t = tables.find((x) => x.id === id);
                  if (t) moveTo(id, t.posX + dx, t.posY + dy);
                }}
              />
            </>
          )}

          {selected ? (
            <div
              role="group"
              aria-label={`Move table ${selected.label}`}
              className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2"
            >
              <span className="mr-auto text-base font-semibold" translate="no">
                {selected.label}
              </span>
              {(
                [
                  ["Left", ArrowLeft, -1, 0],
                  ["Up", ArrowUp, 0, -1],
                  ["Down", ArrowDown, 0, 1],
                  ["Right", ArrowRight, 1, 0],
                ] as const
              ).map(([dir, Icon, dx, dy]) => (
                <Button
                  key={dir}
                  variant="secondary"
                  size="icon"
                  aria-label={`Move ${selected.label} ${dir.toLowerCase()}`}
                  onClick={() => moveTo(selected.id, selected.posX + dx, selected.posY + dy)}
                >
                  <Icon aria-hidden="true" />
                </Button>
              ))}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const t = active?.tables.find((x) => x.id === selected.id);
                  if (t) setOpen({ kind: "table", table: t });
                }}
              >
                <Pencil aria-hidden="true" />
                Edit
              </Button>
            </div>
          ) : null}

          {dirty ? (
            <div
              className="sticky bottom-0 flex flex-col gap-2 rounded-md border border-border bg-background px-4 py-3 shadow-md sm:flex-row sm:items-center sm:justify-between"
              style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
            >
              <p className="text-sm font-medium tabular-nums">
                {draft.size} {draft.size === 1 ? "table" : "tables"} moved — not saved yet
              </p>
              {error ? (
                <p role="alert" className="text-sm font-medium text-destructive">
                  {error}
                </p>
              ) : null}
              <div className="flex gap-2">
                <Button variant="secondary" disabled={saving} onClick={() => setDraft(new Map())}>
                  Discard
                </Button>
                <Button disabled={saving} onClick={() => void save()}>
                  {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                  {saving ? "Saving…" : "Save Layout"}
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}

      <Sheet open={open !== null} onOpenChange={(o) => !o && close()}>
        {open?.kind === "sections" ? (
          <SectionsSheet outletId={outletId} sections={floor.sections} onClose={close} />
        ) : open?.kind === "add" ? (
          <AddTablesSheet
            outletId={outletId}
            sections={floor.sections}
            sectionId={active?.id}
            onClose={close}
          />
        ) : open?.kind === "print" ? (
          <PrintSheet
            outletId={outletId}
            sections={floor.sections}
            activeSection={active}
            selected={active?.tables.find((t) => t.id === selectedId) ?? null}
          />
        ) : open?.kind === "table" ? (
          <TableSheet
            key={open.table.id}
            outletId={outletId}
            sections={floor.sections}
            table={open.table}
            sectionId={active?.id ?? ""}
            onClose={() => {
              close();
              setSelectedId(null);
            }}
          />
        ) : null}
      </Sheet>
    </div>
  );
}
