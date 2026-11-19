import { z } from "zod";
import { orderItemStatusSchema } from "../enums";
import { kotStageSchema } from "../kot-state";

// Kitchen display (M5-T3): the tickets still to cook or hand over, oldest first.

export const kitchenItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  quantity: z.number().int(),
  addOns: z.array(z.string()),
  note: z.string().nullable(),
  status: orderItemStatusSchema,
});

export const kitchenKotSchema = z.object({
  id: z.string(),
  number: z.number().int(),
  createdAt: z.iso.datetime(),
  tableLabel: z.string().nullable(),
  stage: kotStageSchema,
  items: z.array(kitchenItemSchema),
});
export type KitchenKot = z.infer<typeof kitchenKotSchema>;

export const kitchenBoardSchema = z.object({
  /** A ticket older than this many minutes is late (outlet setting). */
  lateAfterMinutes: z.number().int(),
  kots: z.array(kitchenKotSchema),
});
export type KitchenBoard = z.infer<typeof kitchenBoardSchema>;

export const moveKotSchema = z.object({ to: kotStageSchema });
