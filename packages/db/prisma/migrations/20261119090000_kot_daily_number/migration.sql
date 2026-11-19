-- M5-T2: daily KOT numbers. Kot.businessDate (outlet-local date the number belongs to);
-- any existing rows get the IST date they were created on before the column becomes required.
ALTER TABLE "Kot" ADD COLUMN "businessDate" TEXT;
UPDATE "Kot" SET "businessDate" = to_char("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') WHERE "businessDate" IS NULL;
ALTER TABLE "Kot" ALTER COLUMN "businessDate" SET NOT NULL;

-- CreateTable
CREATE TABLE "KotCounter" (
    "organizationId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "businessDate" TEXT NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KotCounter_pkey" PRIMARY KEY ("outletId","businessDate")
);

-- CreateIndex
CREATE INDEX "KotCounter_organizationId_idx" ON "KotCounter"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Kot_outletId_businessDate_number_key" ON "Kot"("outletId", "businessDate", "number");

-- AddForeignKey
ALTER TABLE "KotCounter" ADD CONSTRAINT "KotCounter_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

