import type { PrismaClient } from "@restoos/db";

// Shifts (M1-T7): who is on duty. One open shift per person. A shift starts on the first PIN
// sign-in of the day (outlet setting) or with "Start Shift"; "End Shift" closes it. A shift left
// open from an earlier day is auto-closed at start + 14 h (one staff session) or now if sooner.

export const MAX_SHIFT_HOURS = 14;

/**
 * The outlet's business day for `date`: its local calendar date, "2026-11-19" (M5-T2: daily KOT
 * numbers restart at local midnight). A later-night cut-off would be an outlet setting.
 */
export function businessDateOf(date: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** UTC instant of local midnight for `date` in `timeZone` (e.g. Asia/Kolkata). */
export function startOfDay(date: Date, timeZone: string): Date {
  const parts = (d: Date) => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        hourCycle: "h23",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
      })
        .formatToParts(d)
        .map((x) => [x.type, Number(x.value)]),
    );
    return p as Record<"year" | "month" | "day" | "hour" | "minute" | "second", number>;
  };
  const p = parts(date);
  const guess = Date.UTC(p.year, p.month - 1, p.day);
  // Offset of the zone at that moment (local wall time − UTC); India has no DST, but be exact.
  const q = parts(new Date(guess));
  const offset = Date.UTC(q.year, q.month - 1, q.day, q.hour, q.minute, q.second) - guess;
  return new Date(guess - offset);
}

type ShiftClient = Pick<PrismaClient, "$transaction">;
type OpenShift = { id: string; startedAt: Date };

export type EnsureShiftResult = {
  shift: OpenShift;
  /** True when this call opened the shift. */
  started: boolean;
  /** A shift forgotten from an earlier day that was closed on the way. */
  autoClosed: { id: string; endedAt: Date } | null;
};

const isSerializationConflict = (err: unknown) =>
  err instanceof Error && "code" in err && err.code === "P2034";

/** Opens today's shift if needed (idempotent); closes a forgotten one from an earlier day. */
export async function ensureShift(
  db: ShiftClient,
  input: {
    organizationId: string;
    outletId: string;
    employeeId: string;
    timeZone: string;
    now?: Date;
  },
): Promise<EnsureShiftResult> {
  const now = input.now ?? new Date();
  const today = startOfDay(now, input.timeZone);
  const run = () =>
    db.$transaction(
      async (tx) => {
        const open = await tx.shift.findFirst({
          where: { employeeId: input.employeeId, endedAt: null },
          orderBy: { startedAt: "desc" },
          select: { id: true, startedAt: true },
        });
        if (open && open.startedAt >= today) {
          return { shift: open, started: false, autoClosed: null };
        }
        let autoClosed: EnsureShiftResult["autoClosed"] = null;
        if (open) {
          const cap = new Date(open.startedAt.getTime() + MAX_SHIFT_HOURS * 3600 * 1000);
          const endedAt = cap < now ? cap : now;
          await tx.shift.updateMany({
            where: { employeeId: input.employeeId, endedAt: null },
            data: { endedAt },
          });
          autoClosed = { id: open.id, endedAt };
        }
        const shift = await tx.shift.create({
          data: {
            organizationId: input.organizationId,
            outletId: input.outletId,
            employeeId: input.employeeId,
            startedAt: now,
          },
          select: { id: true, startedAt: true },
        });
        return { shift, started: true, autoClosed };
      },
      // Two sign-ins at the same moment must not open two shifts.
      { isolationLevel: "Serializable" },
    );
  try {
    return await run();
  } catch (err) {
    if (!isSerializationConflict(err)) throw err;
    return run(); // the other transaction won; this run sees its shift and reuses it
  }
}

/** The open shift, or null. */
export function openShift(db: Pick<PrismaClient, "shift">, employeeId: string) {
  return db.shift.findFirst({
    where: { employeeId, endedAt: null },
    orderBy: { startedAt: "desc" },
    select: { id: true, startedAt: true },
  });
}
