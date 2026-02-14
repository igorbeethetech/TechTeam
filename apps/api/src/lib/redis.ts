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

// ---- Redis PubSub connections ----
// WHY separate connections? Redis PubSub has a fundamental restriction:
// once a connection enters subscriber mode (via SUBSCRIBE), it can ONLY
// run subscriber commands (SUBSCRIBE, UNSUBSCRIBE, PSUBSCRIBE, PUNSUBSCRIBE, PING).
// All other commands (GET, SET, PUBLISH, etc.) are rejected with:
// "Connection in subscriber mode, only subscriber commands may be used."
// Therefore we need dedicated connections for subscriber and publisher roles,
// separate from the BullMQ queue/worker connections.

// For PubSub subscriber -- enters subscriber mode, cannot run normal commands
export function createSubscriberConnection() {
  return new IORedis(config.REDIS_URL)
}

// For PubSub publisher -- stays in normal mode, used only for PUBLISH commands
export function createPublisherConnection() {
  return new IORedis(config.REDIS_URL)
}
