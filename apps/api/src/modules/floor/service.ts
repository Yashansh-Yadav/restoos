import { randomBytes } from "node:crypto";
import {
  FLOOR_COLUMNS,
  FLOOR_MAX_Y,
  labelRange,
  type bulkTablesSchema,
  type Floor,
  type FloorTable,
  type layoutSchema,
  type tableInputSchema,
  type tableUpdateSchema,
} from "@restoos/shared";
import type { z } from "zod";
import { writeAudit } from "../../lib/audit";
import { AppError, notFound } from "../../lib/errors";
import type { EventBus } from "../../lib/events";
import type { TenantContext, TenantDb } from "../../lib/tenant";

// Floor editor (M3-T1): sections and tables on a grid (cells, FLOOR_COLUMNS wide). Through the
// tenant client, so another restaurant's ids are "not found". Every new table gets a random QR
// token (M2-T5 serves the customer menu by it; M3-T2 prints and rotates it).

export type FloorDeps = { db: TenantDb; ctx: TenantContext; events: EventBus };
type TableInput = z.output<typeof tableInputSchema>;
type TableUpdate = z.output<typeof tableUpdateSchema>;
type BulkInput = z.output<typeof bulkTablesSchema>;
type LayoutInput = z.output<typeof layoutSchema>;

const tableSelect = {
  id: true,
  label: true,
  seats: true,
  posX: true,
  posY: true,
  status: true,
  qrToken: true,
} as const;
const cell = (x: number, y: number) => `${x}:${y}`;
const qrToken = () => randomBytes(16).toString("base64url");

function outletId(ctx: TenantContext): string {
  if (!ctx.outletId) throw new AppError(400, "OUTLET_REQUIRED", "Choose an outlet first");
  return ctx.outletId;
}

const changed = (deps: FloorDeps) =>
  deps.events.publishEvent(deps.ctx, "floor.changed", { outletId: outletId(deps.ctx) });

const isUniqueViolation = (err: unknown) =>
  err instanceof Error && "code" in err && err.code === "P2002";

const labelTaken = (label: string) =>
  new AppError(409, "LABEL_TAKEN", `There's already a table called ${label}. Pick another name.`);

/** First free cells, row by row, FLOOR_COLUMNS wide. */
function freeCells(occupied: Set<string>, count: number): { posX: number; posY: number }[] {
  const out: { posX: number; posY: number }[] = [];
  for (let y = 0; y <= FLOOR_MAX_Y && out.length < count; y++) {
    for (let x = 0; x < FLOOR_COLUMNS && out.length < count; x++) {
      if (!occupied.has(cell(x, y))) out.push({ posX: x, posY: y });
    }
  }
  if (out.length < count) {
    throw new AppError(409, "SECTION_FULL", "This section's grid is full. Add another section.");
  }
  return out;
}

async function occupiedIn(db: TenantDb, sectionId: string, exceptId?: string) {
  const rows = await db.diningTable.findMany({
    where: { sectionId, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { posX: true, posY: true },
  });
  return new Set(rows.map((r) => cell(r.posX, r.posY)));
}

async function assertSection(db: TenantDb, id: string) {
  if (!(await db.section.findUnique({ where: { id }, select: { id: true } })))
    throw notFound("Section");
}

// ── Read ────────────────────────────────────────────────────────────────────

export async function getFloor({ db, ctx }: FloorDeps): Promise<Floor> {
  outletId(ctx);
  const sections = await db.section.findMany({
    select: {
      id: true,
      name: true,
      sortOrder: true,
      tables: { select: tableSelect, orderBy: [{ posY: "asc" }, { posX: "asc" }] },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return { sections };
}

// ── Sections ────────────────────────────────────────────────────────────────

async function assertSectionName(db: TenantDb, name: string, exceptId?: string) {
  const clash = await db.section.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (clash) {
    throw new AppError(409, "SECTION_NAME_TAKEN", `There's already a section called ${name}.`);
  }
}

export async function createSection(deps: FloorDeps, name: string) {
  const outlet = outletId(deps.ctx);
  await assertSectionName(deps.db, name);
  const last = await deps.db.section.findFirst({
    select: { sortOrder: true },
    orderBy: { sortOrder: "desc" },
  });
  const row = await deps.db.section.create({
    data: {
      organizationId: deps.ctx.organizationId,
      outletId: outlet,
      name,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
    select: { id: true, name: true, sortOrder: true },
  });
  await changed(deps);
  return { ...row, tables: [] as FloorTable[] };
}

export async function renameSection(deps: FloorDeps, id: string, name: string) {
  await assertSection(deps.db, id);
  await assertSectionName(deps.db, name, id);
  await deps.db.section.update({ where: { id }, data: { name } });
  await changed(deps);
}

export async function reorderSections(deps: FloorDeps, ids: string[]) {
  const unique = [...new Set(ids)];
  if ((await deps.db.section.count({ where: { id: { in: unique } } })) !== unique.length) {
    throw notFound("Section");
  }
  await deps.db.$transaction(
    unique.map((id, sortOrder) => deps.db.section.update({ where: { id }, data: { sortOrder } })),
  );
  await changed(deps);
}

export async function deleteSection(deps: FloorDeps, id: string) {
  await assertSection(deps.db, id);
  if ((await deps.db.diningTable.count({ where: { sectionId: id } })) > 0) {
    throw new AppError(409, "SECTION_NOT_EMPTY", "Move or remove its tables first.");
  }
  await deps.db.section.delete({ where: { id } });
  await changed(deps);
}

// ── Tables ──────────────────────────────────────────────────────────────────

export async function createTable(deps: FloorDeps, input: TableInput): Promise<FloorTable> {
  const outlet = outletId(deps.ctx);
  await assertSection(deps.db, input.sectionId);
  const [pos] = freeCells(await occupiedIn(deps.db, input.sectionId), 1);
  try {
    const row = await deps.db.diningTable.create({
      data: {
        organizationId: deps.ctx.organizationId,
        outletId: outlet,
        sectionId: input.sectionId,
        label: input.label,
        seats: input.seats,
        qrToken: qrToken(),
        posX: pos?.posX ?? 0,
        posY: pos?.posY ?? 0,
      },
      select: tableSelect,
    });
    await changed(deps);
    return row;
  } catch (err) {
    if (isUniqueViolation(err)) throw labelTaken(input.label);
    throw err;
  }
}

/** T1–T20 in one go: all or nothing; taken labels are listed so the owner can adjust. */
export async function bulkCreateTables(deps: FloorDeps, input: BulkInput): Promise<FloorTable[]> {
  const outlet = outletId(deps.ctx);
  await assertSection(deps.db, input.sectionId);
  const labels = labelRange(input.prefix, input.from, input.to);
  const taken = (
    await deps.db.diningTable.findMany({
      where: { label: { in: labels } },
      select: { label: true },
    })
  ).map((t) => t.label);
  if (taken.length > 0) {
    throw new AppError(
      409,
      "LABELS_TAKEN",
      `${taken.join(", ")} ${taken.length === 1 ? "already exists" : "already exist"}. Change the range or prefix.`,
      { labels: taken },
    );
  }
  const cells = freeCells(await occupiedIn(deps.db, input.sectionId), labels.length);
  try {
    const rows = await deps.db.$transaction(
      labels.map((label, i) =>
        deps.db.diningTable.create({
          data: {
            organizationId: deps.ctx.organizationId,
            outletId: outlet,
            sectionId: input.sectionId,
            label,
            seats: input.seats,
            qrToken: qrToken(),
            posX: cells[i]?.posX ?? 0,
            posY: cells[i]?.posY ?? 0,
          },
          select: tableSelect,
        }),
      ),
    );
    await changed(deps);
    return rows;
  } catch (err) {
    // Someone added one of these labels a moment ago.
    if (isUniqueViolation(err)) {
      throw new AppError(
        409,
        "LABELS_TAKEN",
        "Some of these tables were just added. Reload and try again.",
      );
    }
    throw err;
  }
}

export async function updateTable(
  deps: FloorDeps,
  id: string,
  input: TableUpdate,
): Promise<FloorTable> {
  const { db } = deps;
  const current = await db.diningTable.findUnique({
    where: { id },
    select: { sectionId: true, posX: true, posY: true },
  });
  if (!current) throw notFound("Table");
  const sectionId = input.sectionId ?? current.sectionId;
  if (input.sectionId && input.sectionId !== current.sectionId)
    await assertSection(db, input.sectionId);

  let pos: { posX: number; posY: number } | undefined;
  if (input.posX !== undefined || input.posY !== undefined) {
    const want = { posX: input.posX ?? current.posX, posY: input.posY ?? current.posY };
    if ((await occupiedIn(db, sectionId, id)).has(cell(want.posX, want.posY))) {
      throw new AppError(409, "CELL_TAKEN", "Another table is already in that spot.");
    }
    pos = want;
  } else if (sectionId !== current.sectionId) {
    pos = freeCells(await occupiedIn(db, sectionId), 1)[0]; // moved section: first free spot
  }

  try {
    const row = await db.diningTable.update({
      where: { id },
      data: {
        ...(input.label !== undefined && { label: input.label }),
        ...(input.seats !== undefined && { seats: input.seats }),
        ...(sectionId !== current.sectionId && { sectionId }),
        ...(pos ?? {}),
      },
      select: tableSelect,
    });
    await changed(deps);
    return row;
  } catch (err) {
    if (isUniqueViolation(err) && input.label) throw labelTaken(input.label);
    throw err;
  }
}

/** Saves dragged positions in one go; the final layout may not put two tables in one cell. */
export async function saveLayout(deps: FloorDeps, input: LayoutInput): Promise<void> {
  const { db } = deps;
  const ids = input.tables.map((t) => t.id);
  if (new Set(ids).size !== ids.length)
    throw new AppError(400, "DUPLICATE_TABLE", "A table is listed twice.");
  const sectionIds = [...new Set(input.tables.map((t) => t.sectionId))];
  if ((await db.section.count({ where: { id: { in: sectionIds } } })) !== sectionIds.length) {
    throw notFound("Section");
  }
  if ((await db.diningTable.count({ where: { id: { in: ids } } })) !== ids.length) {
    throw notFound("Table");
  }

  // Final state = everything currently in the touched sections, with the moves applied.
  const moved = new Map(input.tables.map((t) => [t.id, t]));
  const current = await db.diningTable.findMany({
    where: { OR: [{ sectionId: { in: sectionIds } }, { id: { in: ids } }] },
    select: { id: true, sectionId: true, posX: true, posY: true },
  });
  const seen = new Set<string>();
  for (const t of current) {
    const f = moved.get(t.id) ?? t;
    const key = `${f.sectionId}:${cell(f.posX, f.posY)}`;
    if (seen.has(key)) throw new AppError(409, "CELL_TAKEN", "Two tables can't share a spot.");
    seen.add(key);
  }

  await db.$transaction(
    input.tables.map((t) =>
      db.diningTable.update({
        where: { id: t.id },
        data: { sectionId: t.sectionId, posX: t.posX, posY: t.posY },
      }),
    ),
  );
  await changed(deps);
}

export async function deleteTable(deps: FloorDeps, id: string): Promise<void> {
  const { db } = deps;
  if (!(await db.diningTable.findUnique({ where: { id }, select: { id: true } })))
    throw notFound("Table");
  const [sessions, bells] = await Promise.all([
    db.tableSession.count({ where: { tableId: id } }),
    db.bellEvent.count({ where: { tableId: id } }),
  ]);
  if (sessions + bells > 0) {
    throw new AppError(409, "TABLE_IN_USE", "This table has order history — rename it instead.");
  }
  await db.$transaction(async (tx) => {
    await tx.tableAssignment.deleteMany({ where: { tableId: id } });
    await tx.diningTable.delete({ where: { id } });
  });
  await changed(deps);
}

// ── QR codes (M3-T2) ────────────────────────────────────────────────────────

/** New QR token for one table: the old printed card stops working at once (lookup is uncached). */
export async function rotateQr(deps: FloorDeps, id: string): Promise<FloorTable> {
  const { db, ctx } = deps;
  if (!(await db.diningTable.findUnique({ where: { id }, select: { id: true } })))
    throw notFound("Table");
  const table = await db.$transaction(async (tx) => {
    const row = await tx.diningTable.update({
      where: { id },
      data: { qrToken: qrToken() },
      select: tableSelect,
    });
    await writeAudit(tx, ctx, "table.rotateQr", "DiningTable", id, { label: row.label });
    return row;
  });
  await changed(deps);
  return table;
}

export type QrCard = { label: string; section: string; qrToken: string };

/** Cards to print: every table, one section's, or one table's — in floor order. */
export async function qrCardsFor(
  { db, ctx }: FloorDeps,
  filter: { sectionId?: string | undefined; tableId?: string | undefined },
): Promise<{ outletName: string; cards: QrCard[] }> {
  const outlet = await db.outlet.findUnique({
    where: { id: outletId(ctx) },
    select: { name: true },
  });
  if (filter.sectionId) await assertSection(db, filter.sectionId);
  const tables = await db.diningTable.findMany({
    where: {
      ...(filter.sectionId ? { sectionId: filter.sectionId } : {}),
      ...(filter.tableId ? { id: filter.tableId } : {}),
    },
    select: {
      label: true,
      qrToken: true,
      posX: true,
      posY: true,
      section: { select: { name: true, sortOrder: true } },
    },
  });
  if (filter.tableId && tables.length === 0) throw notFound("Table");
  if (tables.length === 0) {
    throw new AppError(409, "NO_TABLES", "There are no tables to print yet. Add tables first.");
  }
  tables.sort(
    (a, b) =>
      a.section.sortOrder - b.section.sortOrder ||
      a.section.name.localeCompare(b.section.name) ||
      a.posY - b.posY ||
      a.posX - b.posX,
  );
  return {
    outletName: outlet?.name ?? "",
    cards: tables.map((t) => ({ label: t.label, section: t.section.name, qrToken: t.qrToken })),
  };
}
