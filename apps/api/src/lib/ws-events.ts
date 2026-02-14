import type IORedis from "ioredis"
import type { WsEvent } from "@techteam/shared"
import { createPublisherConnection } from "./redis.js"

// Lazy-initialized singleton publisher connection for WebSocket events.
// Created on first use to avoid opening a Redis connection at import time.
let publisher: IORedis | null = null

function getPublisher(): IORedis {
  if (!publisher) {
    publisher = createPublisherConnection()
  }
  return publisher
}

/**
 * Publish a WebSocket event to the tenant-scoped Redis PubSub channel.
 *
 * This is fire-and-forget: errors are logged but never thrown.
 * A failed event publish must NOT block agent execution or API responses.
 */
export async function publishWsEvent(event: WsEvent): Promise<void> {
  try {
    const channel = `ws:tenant:${event.tenantId}`
    await getPublisher().publish(channel, JSON.stringify(event))
  } catch (error) {
    console.error("[ws-events] Failed to publish event:", error)
  }
}

/**
 * Graceful shutdown: close the publisher connection if it was opened.
 */
export async function cleanupPublisher(): Promise<void> {
  if (publisher) {
    await publisher.quit()
    publisher = null
  }
}
