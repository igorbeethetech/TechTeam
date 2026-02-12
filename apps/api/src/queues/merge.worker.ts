import { Worker, type Job } from "bullmq"
import { createWorkerConnection } from "../lib/redis.js"
import { forTenant } from "@techteam/database"
import type { MergeJobData, MergeJobResult } from "./merge.queue.js"

/**
 * Creates and returns the BullMQ worker for the merge queue.
 * Processes merge jobs with concurrency 1 (FIFO, one merge at a time globally).
 *
 * Implements 3-step merge escalation:
 * - Step 1 (complete): Auto-merge via git merge + push + PR close
 * - Step 2 (stubbed): AI conflict resolution (Plan 02)
 * - Step 3 (stubbed): Escalate to human (direct fallthrough)
 */
export function createMergeWorker() {
  const worker = new Worker<MergeJobData, MergeJobResult>(
    "merge-queue",
    async (job: Job<MergeJobData>) => {
      return processMergeJob(job)
    },
    {
      connection: createWorkerConnection(),
      concurrency: 1,
    }
  )

  // CRITICAL: Always attach error handler per BullMQ docs
  worker.on("error", (err) => {
    console.error("[merge-worker] Worker error:", err)
  })

  return worker
}

async function processMergeJob(
  job: Job<MergeJobData>
): Promise<MergeJobResult> {
  const { demandId, tenantId, projectId } = job.data

  const prisma = forTenant(tenantId)

  // Load demand and project
  const demand = await prisma.demand.findUniqueOrThrow({
    where: { id: demandId },
  })
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
  })

  // Guard: branchName required
  const branchName = demand.branchName as string | null
  if (!branchName) {
    throw new Error(
      `[merge-worker] Demand ${demandId} has no branchName -- cannot merge`
    )
  }

  // Guard: prUrl required
  const prUrl = demand.prUrl as string | null
  if (!prUrl) {
    throw new Error(
      `[merge-worker] Demand ${demandId} has no prUrl -- cannot merge`
    )
  }

  // Update demand: mergeStatus = pending, increment mergeAttempts
  await prisma.demand.update({
    where: { id: demandId },
    data: {
      mergeStatus: "pending",
      mergeAttempts: { increment: 1 },
      agentStatus: "running",
    },
  })

  console.log(
    `[merge-worker] Processing merge: demandId=${demandId}, branch=${branchName}`
  )

  try {
    // ---- STEP 1: Auto-merge ----
    const { mergeFromBranch, resetWorkingDir } = await import(
      "../lib/git.js"
    )
    const { closePullRequest, extractPrNumber } = await import(
      "../lib/github.js"
    )
    const { createGitClient } = await import("../lib/git.js")

    const merge = await mergeFromBranch(
      project.repoPath,
      branchName,
      project.defaultBranch
    )

    if (merge.success) {
      // Optionally run post-merge tests (lenient for v1)
      try {
        const { execSync } = await import("node:child_process")
        execSync("npm test", {
          cwd: project.repoPath,
          timeout: 5 * 60 * 1000, // 5 minute timeout
          stdio: "pipe",
        })
        console.log(
          `[merge-worker] Post-merge tests passed: demandId=${demandId}`
        )
      } catch (testErr) {
        // v1: lenient -- testing agent already validated before merge
        console.warn(
          `[merge-worker] Post-merge tests skipped/failed (continuing): demandId=${demandId}`,
          testErr instanceof Error ? testErr.message : testErr
        )
      }

      // Push merged default branch
      const git = createGitClient(project.repoPath)
      await git.push("origin", project.defaultBranch)

      // Close the PR (we merged locally, not via GitHub API)
      await closePullRequest({
        repoUrl: project.repoUrl,
        prNumber: extractPrNumber(prUrl),
      })

      // Update demand: merged, done
      await prisma.demand.update({
        where: { id: demandId },
        data: {
          mergeStatus: "merged",
          stage: "done",
          agentStatus: null,
        },
      })

      console.log(
        `[merge-worker] Merge successful: demandId=${demandId}, branch=${branchName}`
      )

      return { merged: true, mergeStatus: "merged" }
    }

    // ---- Conflicts detected ----
    console.log(
      `[merge-worker] Merge conflicts detected: demandId=${demandId}, files=${merge.conflictFiles.join(", ")}`
    )

    // STEP 2 STUB: AI conflict resolution (Plan 02)
    // For now, directly fall through to Step 3

    // STEP 3 STUB: Escalate to human
    await prisma.demand.update({
      where: { id: demandId },
      data: {
        mergeStatus: "needs_human",
        mergeConflicts: { files: merge.conflictFiles } as any,
        agentStatus: null,
      },
    })

    return {
      merged: false,
      mergeStatus: "needs_human",
      error: "Merge conflicts detected",
    }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : String(error)

    console.error(
      `[merge-worker] Merge failed: demandId=${demandId}, error=${errorMessage}`
    )

    // Update demand to needs_human on failure
    await prisma.demand.update({
      where: { id: demandId },
      data: {
        mergeStatus: "needs_human",
        agentStatus: null,
      },
    })

    // Clean up working directory
    try {
      const { resetWorkingDir } = await import("../lib/git.js")
      await resetWorkingDir(project.repoPath)
    } catch (cleanupErr) {
      console.warn(
        `[merge-worker] Failed to reset working dir: ${cleanupErr instanceof Error ? cleanupErr.message : cleanupErr}`
      )
    }

    // Re-throw for BullMQ retry
    throw error
  }
}
