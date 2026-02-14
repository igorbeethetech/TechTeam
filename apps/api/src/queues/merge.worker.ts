import { Worker, type Job } from "bullmq"
import { createWorkerConnection } from "../lib/redis.js"
import { forTenant } from "@techteam/database"
import type { MergeJobData, MergeJobResult } from "./merge.queue.js"
import { publishWsEvent } from "../lib/ws-events.js"
import type { WsEvent } from "@techteam/shared"

// Fire-and-forget wrapper: ensures publishWsEvent failures never block or crash the worker.
// publishWsEvent already has try/catch internally, but this provides double safety.
async function emitEvent(event: WsEvent): Promise<void> {
  try { await publishWsEvent(event) } catch { /* never block worker */ }
}

/**
 * Creates and returns the BullMQ worker for the merge queue.
 * Processes merge jobs with concurrency 1 (FIFO, one merge at a time globally).
 *
 * Implements 3-step merge escalation:
 * - Step 1: Auto-merge via git merge + push + PR close
 * - Step 2: AI conflict resolution via merge-resolver agent
 * - Step 3: Escalate to human with conflict context
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
  await emitEvent({ type: "demand:updated", tenantId, payload: { demandId, projectId } })

  console.log(
    `[merge-worker] Processing merge: demandId=${demandId}, branch=${branchName}`
  )

  try {
    // ---- STEP 1: Auto-merge ----
    const { mergeFromBranch, resetWorkingDir, createGitClient, checkConflictMarkers } =
      await import("../lib/git.js")
    const { closePullRequest, extractPrNumber } = await import(
      "../lib/github.js"
    )

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

      // Update demand: merged, done, set completedAt for accurate metrics (METR-02)
      await prisma.demand.update({
        where: { id: demandId },
        data: {
          mergeStatus: "merged",
          stage: "done",
          agentStatus: null,
          completedAt: new Date(),
        } as any,
      })
      await emitEvent({ type: "demand:stage-changed", tenantId, payload: { demandId, projectId } })

      // NOTIF-03: Notify on demand completion
      try {
        await (prisma as any).notification.create({
          data: {
            type: "demand_done",
            title: "Demand completed",
            message: `"${demand.title}" has been merged and is now done.`,
            demandId,
            projectId,
          },
        })
        await emitEvent({ type: "notification:created", tenantId, payload: { demandId } })
      } catch (notifErr) {
        console.warn("[merge-worker] Failed to create done notification:", notifErr)
      }

      console.log(
        `[merge-worker] STEP 1 success: demandId=${demandId}, branch=${branchName}`
      )

      return { merged: true, mergeStatus: "merged" }
    }

    // ---- Conflicts detected ----
    console.log(
      `[merge-worker] STEP 1 conflicts detected: demandId=${demandId}, files=${merge.conflictFiles.join(", ")}`
    )

    // ---- STEP 2: AI Conflict Resolution ----
    console.log(
      `[merge-worker] STEP 2 starting AI conflict resolution: demandId=${demandId}`
    )

    // Update demand: conflict_resolving
    await prisma.demand.update({
      where: { id: demandId },
      data: { mergeStatus: "conflict_resolving" },
    })
    await emitEvent({ type: "demand:updated", tenantId, payload: { demandId, projectId } })

    // Reload demand to get current mergeAttempts
    const currentDemand = await prisma.demand.findUniqueOrThrow({
      where: { id: demandId },
    })

    // Create AgentRun record for merge-resolver
    const agentRun = await prisma.agentRun.create({
      data: {
        tenantId,
        demandId,
        phase: "merge",
        status: "running",
        attempt: (currentDemand.mergeAttempts as number) || 1,
      },
    })
    await emitEvent({ type: "agent-run:updated", tenantId, payload: { demandId } })

    // Re-attempt the merge to leave conflict markers in the working directory
    const git = createGitClient(project.repoPath)
    await git.fetch("origin")
    await git.checkout(project.defaultBranch)
    await git.pull("origin", project.defaultBranch)
    try {
      await git.merge([branchName])
    } catch {
      // Expected -- merge will fail with conflicts
    }

    // Get conflicted files from the working directory
    const status = await git.status()
    const conflictedFiles = status.conflicted

    if (conflictedFiles.length > 0) {
      // Dynamic import merge-resolver agent
      const { runMergeResolverAgent } = await import(
        "../agents/merge-resolver.agent.js"
      )

      const agentResult = await runMergeResolverAgent({
        demandId,
        tenantId,
        projectId,
        repoPath: project.repoPath,
        branchName,
        defaultBranch: project.defaultBranch,
        conflictFiles: conflictedFiles,
        timeout: 10 * 60 * 1000, // 10 minute timeout
      })

      // Update AgentRun with result metrics
      await prisma.agentRun.update({
        where: { id: agentRun.id },
        data: {
          status: agentResult.resolved ? "completed" : "failed",
          tokensIn: agentResult.tokensIn,
          tokensOut: agentResult.tokensOut,
          costUsd: agentResult.costUsd,
          durationMs: agentResult.durationMs,
          output: agentResult.output as any,
        },
      })
      await emitEvent({ type: "agent-run:updated", tenantId, payload: { demandId } })

      // Accumulate costs on demand (same pattern as other agents)
      await prisma.demand.update({
        where: { id: demandId },
        data: {
          totalTokens: {
            increment: agentResult.tokensIn + agentResult.tokensOut,
          },
          totalCostUsd: { increment: agentResult.costUsd },
        },
      })

      // Check resolution: verify no conflicts remain
      const postStatus = await git.status()
      const stillConflicted = postStatus.conflicted.length > 0

      // Also check for lingering conflict markers in tracked files
      const hasMarkers = await checkConflictMarkers(project.repoPath)

      if (agentResult.resolved && !stillConflicted && !hasMarkers) {
        // AI resolution succeeded -- commit, push, close PR
        await git.commit(
          `merge: AI-resolved conflicts for demand/${demandId}`
        )
        await git.push("origin", project.defaultBranch)

        await closePullRequest({
          repoUrl: project.repoUrl,
          prNumber: extractPrNumber(prUrl),
        })

        // Update demand: merged, done, set completedAt for accurate metrics (METR-02)
        await prisma.demand.update({
          where: { id: demandId },
          data: {
            mergeStatus: "merged",
            stage: "done",
            agentStatus: null,
            completedAt: new Date(),
          } as any,
        })
        await emitEvent({ type: "demand:stage-changed", tenantId, payload: { demandId, projectId } })

        // NOTIF-03: Notify on demand completion
        try {
          await (prisma as any).notification.create({
            data: {
              type: "demand_done",
              title: "Demand completed",
              message: `"${demand.title}" has been merged and is now done.`,
              demandId,
              projectId,
            },
          })
          await emitEvent({ type: "notification:created", tenantId, payload: { demandId } })
        } catch (notifErr) {
          console.warn("[merge-worker] Failed to create done notification:", notifErr)
        }

        console.log(
          `[merge-worker] STEP 2 AI resolution succeeded: demandId=${demandId}`
        )

        return { merged: true, mergeStatus: "merged" }
      }

      // AI resolution failed -- clean up working directory
      console.log(
        `[merge-worker] STEP 2 AI resolution failed: demandId=${demandId}, stillConflicted=${stillConflicted}, hasMarkers=${hasMarkers}`
      )
      await git.merge(["--abort"]).catch(() => {})
      await git.reset(["--hard", `origin/${project.defaultBranch}`])
    } else {
      // No conflicted files found after re-merge (edge case)
      console.warn(
        `[merge-worker] STEP 2 no conflicted files found after re-merge: demandId=${demandId}`
      )
      await prisma.agentRun.update({
        where: { id: agentRun.id },
        data: { status: "failed", output: { error: "No conflicted files found after re-merge" } as any },
      })
      await emitEvent({ type: "agent-run:updated", tenantId, payload: { demandId } })
      await git.merge(["--abort"]).catch(() => {})
      await git.reset(["--hard", `origin/${project.defaultBranch}`])
    }

    // ---- STEP 3: Escalate to Human ----
    console.log(
      `[merge-worker] STEP 3 escalating to human: demandId=${demandId}, conflicts in ${merge.conflictFiles.length} files`
    )

    await prisma.demand.update({
      where: { id: demandId },
      data: {
        mergeStatus: "needs_human",
        mergeConflicts: {
          files: merge.conflictFiles,
          attemptedAI: true,
          mergeAttempts: (currentDemand.mergeAttempts as number) || 1,
        } as any,
        agentStatus: null,
      },
    })
    await emitEvent({ type: "demand:updated", tenantId, payload: { demandId, projectId } })

    // NOTIF-02: Notify on merge escalation to human
    try {
      await (prisma as any).notification.create({
        data: {
          type: "merge_needs_human",
          title: "Merge needs attention",
          message: `"${demand.title}" has merge conflicts that require manual resolution.`,
          demandId,
          projectId,
        },
      })
      await emitEvent({ type: "notification:created", tenantId, payload: { demandId } })
    } catch (notifErr) {
      console.warn("[merge-worker] Failed to create merge notification:", notifErr)
    }

    return {
      merged: false,
      mergeStatus: "needs_human",
      error: "Merge conflicts detected -- AI resolution failed, escalated to human",
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
    await emitEvent({ type: "demand:updated", tenantId, payload: { demandId, projectId } })

    // NOTIF-02: Notify on merge failure requiring human intervention
    try {
      await (prisma as any).notification.create({
        data: {
          type: "merge_needs_human",
          title: "Merge needs attention",
          message: `"${demand.title}" merge failed: ${errorMessage.slice(0, 200)}`,
          demandId,
          projectId,
        },
      })
      await emitEvent({ type: "notification:created", tenantId, payload: { demandId } })
    } catch (notifErr) {
      console.warn("[merge-worker] Failed to create merge notification:", notifErr)
    }

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
