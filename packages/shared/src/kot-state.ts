import { z } from "zod";
import type { OrderItemStatus } from "./enums";

// Kitchen ticket stages (M5-T3). A KOT has no status column: its stage comes from its items.
// Voided and served items don't count; when nothing is left, the ticket leaves the board.
//   NEW = every active item SENT · PREPARING = any PREPARING · READY = every active item READY
// The kitchen moves a whole ticket one step at a time (forward, or back to undo a mis-tap).

export const KOT_STAGES = ["NEW", "PREPARING", "READY"] as const;
export const kotStageSchema = z.enum(KOT_STAGES);
export type KotStage = z.infer<typeof kotStageSchema>;

/** Item status that each stage puts the ticket's active items in. */
export const STAGE_ITEM_STATUS = {
  NEW: "SENT",
  PREPARING: "PREPARING",
  READY: "READY",
} as const satisfies Record<KotStage, OrderItemStatus>;

const ACTIVE = new Set<OrderItemStatus>(["SENT", "PREPARING", "READY"]);

/** The ticket's stage, or null when it has nothing left to cook or hand over. */
export function kotStage(statuses: readonly OrderItemStatus[]): KotStage | null {
  const active = statuses.filter((s) => ACTIVE.has(s));
  if (active.length === 0) return null;
  if (active.every((s) => s === "READY")) return "READY";
  if (active.every((s) => s === "SENT")) return "NEW";
  return "PREPARING";
}

/** One step forward, or one step back (undo). */
export function isKotStep(from: KotStage, to: KotStage): boolean {
  return Math.abs(KOT_STAGES.indexOf(from) - KOT_STAGES.indexOf(to)) === 1;
}
