import type { ChildProcess } from "node:child_process"
import type IORedis from "ioredis"

const CANCEL_CHANNEL_PREFIX = "techteam:cancel:"

export interface ProcessHandle {
  demandId: string
  agentRunId: string
  type: "cli" | "sdk"
  childProcess?: ChildProcess
  abortController?: AbortController
}

// In-memory registry: demandId -> ProcessHandle
const registry = new Map<string, ProcessHandle>()

/** Register a running agent process. Called by executors after spawn. */
export function registerProcess(handle: ProcessHandle): void {
  registry.set(handle.demandId, handle)
}

/** Unregister a process. Called when agent finishes (success, failure, or cancel). */
export function unregisterProcess(demandId: string): void {
  registry.delete(demandId)
}

/**
 * Cancel a process locally. Kills CLI child process or aborts SDK controller.
 * Returns true if a process was found and cancelled.
 */
export function cancelProcess(demandId: string): boolean {
  const handle = registry.get(demandId)
  if (!handle) return false

  if (handle.type === "cli" && handle.childProcess) {
    handle.childProcess.kill("SIGTERM")
  } else if (handle.type === "sdk" && handle.abortController) {
    handle.abortController.abort()
  }

  registry.delete(demandId)
  return true
}

/** Check if a process is registered for a demand. */
export function hasProcess(demandId: string): boolean {
  return registry.has(demandId)
}

/**
 * Publish a cancel signal via Redis pub/sub. Called from the API process
 * to reach the worker process where the agent is actually running.
 */
export async function requestCancelViaRedis(
  redis: IORedis,
  demandId: string
): Promise<void> {
  await redis.publish(`${CANCEL_CHANNEL_PREFIX}${demandId}`, "cancel")
}

/**
 * Start listening for cancel signals on Redis pub/sub.
 * Called once at worker startup. Uses a dedicated subscriber connection.
 */
export function startCancelListener(subscriberRedis: IORedis): void {
  subscriberRedis.psubscribe(`${CANCEL_CHANNEL_PREFIX}*`)

  subscriberRedis.on("pmessage", (_pattern, channel, _message) => {
    const demandId = channel.replace(CANCEL_CHANNEL_PREFIX, "")
    const cancelled = cancelProcess(demandId)
    if (cancelled) {
      console.log(`[process-registry] Cancelled process for demand ${demandId} via Redis signal`)
    }
  })

  console.log("[process-registry] Cancel listener started")
}
