import { closePullRequest, deleteRemoteBranch, extractPrNumber, getGithubTokenForTenant } from "./github.js"
import { releaseDevSlot } from "./concurrency.js"
import IORedis from "ioredis"
import { config } from "./config.js"

interface CleanupParams {
  demand: {
    id: string
    projectId: string
    prUrl: string | null
    branchName: string | null
    project?: {
      repoUrl: string
      maxConcurrentDev?: number
    } | null
  }
  tenantId: string
  closePr: boolean
  deleteBranch: boolean
}

interface CleanupResult {
  prClosed: boolean
  branchDeleted: boolean
}

/**
 * Centralized cleanup of demand resources (PR, branch, dev slot).
 * Used by cancel-demand and reset-demand endpoints.
 * Tolerates failures (already closed/deleted).
 */
export async function cleanupDemandResources(params: CleanupParams): Promise<CleanupResult> {
  const { demand, tenantId, closePr, deleteBranch } = params
  const result: CleanupResult = { prClosed: false, branchDeleted: false }

  let githubToken: string | undefined
  try {
    githubToken = await getGithubTokenForTenant(tenantId)
  } catch {
    // No token configured - can't do GitHub operations
  }

  const repoUrl = demand.project?.repoUrl

  // Close PR if requested
  if (closePr && demand.prUrl && repoUrl && githubToken) {
    try {
      const prNumber = extractPrNumber(demand.prUrl)
      await closePullRequest({ repoUrl, prNumber, token: githubToken })
      result.prClosed = true
    } catch (err) {
      console.warn(`[cleanup] Failed to close PR for demand ${demand.id}:`, err)
    }
  }

  // Delete remote branch if requested
  if (deleteBranch && demand.branchName && repoUrl && githubToken) {
    try {
      await deleteRemoteBranch({ repoUrl, branchName: demand.branchName, token: githubToken })
      result.branchDeleted = true
    } catch (err) {
      console.warn(`[cleanup] Failed to delete branch for demand ${demand.id}:`, err)
    }
  }

  // Release dev slot
  try {
    const redis = new IORedis(config.REDIS_URL)
    await releaseDevSlot(redis, demand.projectId, demand.id)
    await redis.quit()
  } catch (err) {
    console.warn(`[cleanup] Failed to release dev slot for demand ${demand.id}:`, err)
  }

  return result
}
