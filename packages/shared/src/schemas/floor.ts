import { z } from "zod";
import { tableStatusSchema } from "../enums";

// Floor editor (M3-T1): sections (Main Hall, Terrace) and their tables on a simple grid.

export const FLOOR_COLUMNS = 8;
export const FLOOR_MAX_X = 19;
export const FLOOR_MAX_Y = 49;
export const BULK_TABLES_MAX = 100;

/** "t 12" → "T12". Labels are what staff say out loud and what's printed on the QR card. */
export const normaliseLabel = (v: string) => v.trim().toUpperCase().replace(/\s+/g, "");

export const tableLabelSchema = z
  .string()
  .transform(normaliseLabel)
  .pipe(
    z
      .string()
      .min(1, "Enter a table name, e.g. T1")
      .max(8, "Table names can be up to 8 characters")
      .regex(/^[A-Z0-9-]+$/, "Use letters, digits and - only, e.g. T1 or VIP-2"),
  );

const sectionName = z
  .string()
  .trim()
  .min(1, "Enter a section name, e.g. Main Hall")
  .max(40, "Section names can be up to 40 characters");

export const sectionInputSchema = z.object({ name: sectionName });
export const sectionOrderSchema = z.object({ ids: z.array(z.string().min(1)).min(1) });

export const seatsSchema = z.number().int().min(1, "At least 1 seat").max(30, "At most 30 seats");

export const tableInputSchema = z.object({
  sectionId: z.string().min(1, "Choose a section"),
  label: tableLabelSchema,
  seats: seatsSchema.default(4),
});

export const tableUpdateSchema = z
  .object({
    sectionId: z.string().min(1),
    label: tableLabelSchema,
    seats: seatsSchema,
    posX: z.number().int().min(0).max(FLOOR_MAX_X),
    posY: z.number().int().min(0).max(FLOOR_MAX_Y),
  })
  .partial();

/** T + 1..20 → T1 … T20; a leading zero in `from` pads: A + 01..12 → A01 … A12. */
export function labelRange(prefix: string, from: string | number, to: number): string[] {
  const start = typeof from === "number" ? from : Number(from);
  const width = typeof from === "string" && /^0\d/.test(from) ? from.length : 0;
  const labels: string[] = [];
  for (let n = start; n <= to; n++) {
    labels.push(normaliseLabel(`${prefix}${String(n).padStart(width, "0")}`));
  }
  return labels;
}

export const bulkTablesSchema = z
  .object({
    sectionId: z.string().min(1, "Choose a section"),
    prefix: z
      .string()
      .transform(normaliseLabel)
      .pipe(
        z
          .string()
          .max(5, "Keep the prefix short, e.g. T")
          .regex(/^[A-Z-]*$/, "Use letters, e.g. T"),
      ),
    /** Text so "01" can ask for padded labels (A01…). Prefix ≤ 5 + 3 digits keeps labels ≤ 8. */
    from: z
      .string()
      .trim()
      .regex(/^\d{1,3}$/, "From must be a number, e.g. 1"),
    to: z.number().int().min(1).max(999),
    seats: seatsSchema.default(4),
  })
  .refine((b) => Number(b.from) <= b.to, { path: ["to"], message: "“To” must be at least “From”" })
  .refine((b) => b.to - Number(b.from) + 1 <= BULK_TABLES_MAX, {
    path: ["to"],
    message: `At most ${BULK_TABLES_MAX} tables at once`,
  });

export const layoutSchema = z.object({
  tables: z
    .array(
      z.object({
        id: z.string().min(1),
        sectionId: z.string().min(1),
        posX: z.number().int().min(0).max(FLOOR_MAX_X),
        posY: z.number().int().min(0).max(FLOOR_MAX_Y),
      }),
    )
    .min(1),
});

export const floorTableSchema = z.object({
  id: z.string(),
  label: z.string(),
  seats: z.number().int(),
  posX: z.number().int(),
  posY: z.number().int(),
  status: tableStatusSchema,
  /** Owner screens only: the customer link is /t/{qrToken} (M3-T2 prints and rotates it). */
  qrToken: z.string(),
});
export type FloorTable = z.infer<typeof floorTableSchema>;

export const floorSectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  sortOrder: z.number().int(),
  tables: z.array(floorTableSchema),
});
export type FloorSection = z.infer<typeof floorSectionSchema>;

export const floorSchema = z.object({ sections: z.array(floorSectionSchema) });
export type Floor = z.infer<typeof floorSchema>;
