-- AlterEnum
ALTER TYPE "AgentStatus" ADD VALUE 'cancelled';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'demand_cancelled';

-- AlterTable
ALTER TABLE "AgentRun" ADD COLUMN     "jobId" TEXT;
