import { z } from "zod";

// Table assignment per shift (M3-T3): which butler looks after which table right now.

export const assignTableSchema = z.object({
  /** null = take the table off whoever has it. */
  employeeId: z.string().min(1).nullable(),
});
export const assignSectionSchema = z.object({ employeeId: z.string().min(1) });

export const assignmentButlerSchema = z.object({
  id: z.string(),
  name: z.string(),
  onShift: z.boolean(),
  /** Tables they hold now (on shift). */
  tableIds: z.array(z.string()),
  /** Off shift: the tables they had last shift — they come back when the shift starts. */
  usualTableIds: z.array(z.string()),
});
export type AssignmentButler = z.infer<typeof assignmentButlerSchema>;

export const assignmentTableSchema = z.object({
  id: z.string(),
  label: z.string(),
  seats: z.number().int(),
  posX: z.number().int(),
  posY: z.number().int(),
  butlerId: z.string().nullable(),
});
export type AssignmentTable = z.infer<typeof assignmentTableSchema>;

export const assignmentBoardSchema = z.object({
  butlers: z.array(assignmentButlerSchema),
  sections: z.array(
    z.object({ id: z.string(), name: z.string(), tables: z.array(assignmentTableSchema) }),
  ),
});
export type AssignmentBoard = z.infer<typeof assignmentBoardSchema>;

/**
 * Which of last shift's tables a butler gets back when a new shift starts: still existing, and
 * not held by another on-shift butler right now. Order kept, duplicates dropped.
 */
export function copyPlan(
  previous: readonly string[],
  existing: ReadonlySet<string>,
  takenByOthers: ReadonlySet<string>,
): string[] {
  return [...new Set(previous)].filter((id) => existing.has(id) && !takenByOthers.has(id));
}
