-- AlterTable
ALTER TABLE "Demand" ADD COLUMN     "cancelledAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Demand_cancelledAt_idx" ON "Demand"("cancelledAt");
