-- M5-T5: when a sent item was voided (VOID KOT print in M6, leakage report in M10)
ALTER TABLE "OrderItem" ADD COLUMN     "voidedAt" TIMESTAMP(3);
