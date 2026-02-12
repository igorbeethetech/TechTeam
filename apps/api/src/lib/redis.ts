import IORedis from "ioredis"
import { config } from "./config.js"

// For Queue instances (producers) -- use default maxRetriesPerRequest
export function createQueueConnection() {
  return new IORedis(config.REDIS_URL)
}

// For Worker instances -- must set maxRetriesPerRequest to null
// CRITICAL: BullMQ workers use blocking Redis commands (BRPOPLPUSH).
// IORedis defaults maxRetriesPerRequest to 20, which triggers
// MaxRetriesPerRequestError on long-running blocking calls.
export function createWorkerConnection() {
  return new IORedis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
  })
}
