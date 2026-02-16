// Worker process entry point
// Runs separately from the API server to process agent jobs

// Import config first to trigger dotenv loading
import "./lib/config.js"
import { createAgentWorker } from "./queues/agent.worker.js"
import { createMergeWorker } from "./queues/merge.worker.js"

const agentWorker = createAgentWorker()
const mergeWorker = createMergeWorker()

console.log("[agent-worker] Agent worker started")
console.log("[merge-worker] Merge worker started")

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.log(`[worker] Received ${signal}, closing workers...`)
  await Promise.all([agentWorker.close(), mergeWorker.close()])
  process.exit(0)
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"))
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"))

process.on("uncaughtException", (err) => {
  console.error("[agent-worker] Uncaught exception:", err)
})

process.on("unhandledRejection", (reason, promise) => {
  console.error("[agent-worker] Unhandled rejection:", { promise, reason })
})
