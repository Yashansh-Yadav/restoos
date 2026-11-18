"use client";

import { FLOOR_COLUMNS } from "@restoos/shared";
import { Users } from "lucide-react";
import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// The floor as a grid of cells (M3-T1). Editable: drag a tile to a cell (touch or mouse), or
// select it and use arrow keys / the move buttons (dragging is never the only way). Read-only
// use (M3-T4 staff floor) just omits the callbacks.

export const CELL = 80; // px per grid cell; tiles are 68px (≥ DESIGN.md 44px, staff 56px+)

export type GridTable = { id: string; label: string; seats: number; posX: number; posY: number };

export function FloorGrid({
  tables,
  selectedId,
  onSelect,
  onDrop,
  onKeyMove,
  tileClassName,
  tileExtra,
  tileLabel,
  isPressed,
}: {
  tables: GridTable[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Tile dropped on a cell (the editor moves it, or swaps with the table there). */
  onDrop?: (id: string, posX: number, posY: number) => void;
  /** Arrow key on the focused tile. */
  onKeyMove?: (id: string, dx: number, dy: number) => void;
  tileClassName?: (t: GridTable) => string | undefined;
  tileExtra?: (t: GridTable) => ReactNode;
  /** Extra words for the tile's accessible name (e.g. who looks after it). */
  tileLabel?: (t: GridTable) => string;
  /** Toggle state per tile when "pressed" means more than "selected" (assignment board). */
  isPressed?: (t: GridTable) => boolean;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const rows = Math.max(4, ...tables.map((t) => t.posY + 2));
  const editable = Boolean(onDrop);

  const cellAt = (clientX: number, clientY: number) => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = Math.floor((clientX - rect.left) / CELL);
    const y = Math.floor((clientY - rect.top) / CELL);
    if (x < 0 || y < 0 || x >= FLOOR_COLUMNS || y >= rows) return null;
    return { x, y };
  };

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>, id: string) => {
    if (!editable || e.button !== 0) return;
    drag.current = { id, x: e.clientX, y: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8) return; // a tap, not a drag
    d.moved = true;
    setDragId(d.id);
    setHover(cellAt(e.clientX, e.clientY));
  };
  const onPointerUp = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    setDragId(null);
    setHover(null);
    if (!d) return;
    if (!d.moved) {
      onSelect?.(d.id);
      return;
    }
    const target = cellAt(e.clientX, e.clientY);
    if (target) onDrop?.(d.id, target.x, target.y);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, id: string) => {
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const d = delta[e.key];
    if (!d || !onKeyMove) return;
    e.preventDefault();
    onKeyMove(id, d[0], d[1]);
  };

  // Visual order = tab order (row by row).
  const ordered = [...tables].sort((a, b) => a.posY - b.posY || a.posX - b.posX);

  return (
    <div className="overflow-x-auto overscroll-x-contain rounded-md border border-border bg-muted/40 p-2">
      <div
        ref={gridRef}
        className="relative"
        style={{
          width: FLOOR_COLUMNS * CELL,
          height: rows * CELL,
          backgroundImage: editable
            ? "radial-gradient(circle, var(--border) 1.5px, transparent 1.5px)"
            : undefined,
          backgroundSize: `${CELL}px ${CELL}px`,
          backgroundPosition: `${CELL / 2}px ${CELL / 2}px`,
        }}
      >
        {hover ? (
          <div
            aria-hidden="true"
            className="absolute rounded-md border-2 border-dashed border-foreground/60"
            style={{
              left: hover.x * CELL + 6,
              top: hover.y * CELL + 6,
              width: CELL - 12,
              height: CELL - 12,
            }}
          />
        ) : null}
        {ordered.map((t) => {
          const selected = t.id === selectedId;
          const dragging = t.id === dragId;
          return (
            <button
              key={t.id}
              type="button"
              onPointerDown={(e) => onPointerDown(e, t.id)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={() => {
                drag.current = null;
                setDragId(null);
                setHover(null);
              }}
              onClick={(e) => {
                // Editor: pointer taps are handled on pointer-up (to tell them from drags), so only
                // keyboard Enter/Space lands here. Read-only grids: every click is a tap.
                if (!editable || e.detail === 0) onSelect?.(t.id);
              }}
              onKeyDown={(e) => onKeyDown(e, t.id)}
              aria-pressed={onSelect ? (isPressed ? isPressed(t) : selected) : undefined}
              aria-label={`Table ${t.label}, ${t.seats} seats${editable ? `, row ${t.posY + 1} column ${t.posX + 1}` : ""}${tileLabel ? `, ${tileLabel(t)}` : ""}`}
              className={cn(
                "absolute top-0 left-0 flex flex-col items-center justify-center gap-0.5 rounded-md border-2 bg-background select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                // Editor: tiles capture touch for dragging; read-only grids keep normal scrolling.
                editable ? "[touch-action:none]" : "[touch-action:manipulation]",
                "transition-[transform,box-shadow] duration-150 motion-reduce:transition-none",
                selected ? "border-foreground shadow-md" : "border-input",
                dragging && "z-10 opacity-70 shadow-lg",
                tileClassName?.(t),
              )}
              style={{
                transform: `translate(${t.posX * CELL + 6}px, ${t.posY * CELL + 6}px)`,
                width: CELL - 12,
                height: CELL - 12,
              }}
            >
              <span className="text-xl leading-none font-bold tabular-nums" translate="no">
                {t.label}
              </span>
              <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground tabular-nums">
                <Users className="size-3" aria-hidden="true" />
                {t.seats}
              </span>
              {tileExtra?.(t)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
