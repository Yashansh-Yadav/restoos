import { z } from "zod";

// zod schemas for calculateBill() input — validated by the API (M7) and the web cart (M5).
// Amounts are integer paise, rates integer basis points (CLAUDE.md rule 1).

const paise = z.number().int().nonnegative();
const bps = z.number().int().min(0).max(10_000);

export const discountSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("PERCENT"), bps }),
  z.object({ kind: z.literal("AMOUNT"), paise }),
]);

export const billLineInputSchema = z.object({
  id: z.string().min(1),
  unitPrice: paise,
  quantity: z.number().int().positive(),
  taxRateBps: bps,
  discount: discountSchema.optional(),
});

export const billInputSchema = z.object({
  pricesIncludeTax: z.boolean(),
  taxType: z.enum(["CGST_SGST", "IGST"]).optional(),
  lines: z.array(billLineInputSchema),
  billDiscount: discountSchema.optional(),
  serviceChargeBps: bps.optional(),
});
