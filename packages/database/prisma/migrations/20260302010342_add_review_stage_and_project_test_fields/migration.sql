-- AlterEnum
ALTER TYPE "DemandStage" ADD VALUE 'review';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'demand_ready_for_review';
ALTER TYPE "NotificationType" ADD VALUE 'demand_rejected';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "previewUrlTemplate" TEXT,
ADD COLUMN     "testInstructions" TEXT;
