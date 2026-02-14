import type { FastifyInstance } from "fastify"
import { WebSocket } from "ws"
import type { WsEvent } from "@techteam/shared"
import { createSubscriberConnection } from "../lib/redis.js"
import type IORedis from "ioredis"

// ---- Tenant-scoped connection map ----
// Maps tenantId -> Set of active WebSocket connections for that tenant.
// Only clients within the same tenant receive the same events.
const tenantConnections = new Map<string, Set<WebSocket>>()

// ---- Redis PubSub subscriber (lazy, created on first client connect) ----
let subscriber: IORedis | null = null

function getSubscriber(): IORedis {
  if (!subscriber) {
    subscriber = createSubscriberConnection()
    subscriber.on("message", (channel: string, message: string) => {
      // Channel format: ws:tenant:{tenantId}
      const tenantId = channel.replace("ws:tenant:", "")
      broadcastToTenant(tenantId, message)
    })
  }
  return subscriber
}

/**
 * Broadcast a raw JSON message to all open WebSocket connections for a tenant.
 */
export function broadcastToTenant(tenantId: string, message: string): void {
  const connections = tenantConnections.get(tenantId)
  if (!connections) return
  for (const ws of connections) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message)
    }
  }
}

// ---- Heartbeat tracking ----
// We use a WeakMap to track the isAlive flag per socket so we don't
// pollute the WebSocket instance with custom properties.
const socketAlive = new WeakMap<WebSocket, boolean>()

export default async function wsRoutes(fastify: FastifyInstance) {
  // ---- Heartbeat interval (30 seconds) ----
  const heartbeatInterval = setInterval(() => {
    for (const [, connections] of tenantConnections) {
      for (const ws of connections) {
        if (socketAlive.get(ws) === false) {
          // No pong received since last ping -- zombie connection
          ws.terminate()
          continue
        }
        socketAlive.set(ws, false)
        ws.ping()
      }
    }
  }, 30_000)

  // Clean up heartbeat interval when Fastify closes
  fastify.addHook("onClose", async () => {
    clearInterval(heartbeatInterval)
    // Close all active connections
    for (const [, connections] of tenantConnections) {
      for (const ws of connections) {
        ws.close(1001, "Server shutting down")
      }
    }
    tenantConnections.clear()
    // Close Redis subscriber
    if (subscriber) {
      await subscriber.quit()
      subscriber = null
    }
  })

  // ---- WebSocket route ----
  // Registered inside the protected scope, so authPlugin's preHandler hook
  // fires automatically on the HTTP upgrade request (browsers send cookies
  // on WebSocket upgrade). tenantPlugin also fires, attaching request.prisma.
  fastify.get("/ws", { websocket: true }, (socket, request) => {
    const tenantId = request.session?.session?.activeOrganizationId
    if (!tenantId) {
      socket.close(4001, "No tenant context")
      return
    }

    // Register connection in tenant map
    if (!tenantConnections.has(tenantId)) {
      tenantConnections.set(tenantId, new Set())
    }
    tenantConnections.get(tenantId)!.add(socket)

    // Subscribe to Redis channel if this is the first client for this tenant
    const sub = getSubscriber()
    if (tenantConnections.get(tenantId)!.size === 1) {
      sub.subscribe(`ws:tenant:${tenantId}`)
    }

    // Mark connection as alive for heartbeat
    socketAlive.set(socket, true)
    socket.on("pong", () => {
      socketAlive.set(socket, true)
    })

    // ---- Cleanup on disconnect ----
    const cleanup = () => {
      const connections = tenantConnections.get(tenantId)
      if (connections) {
        connections.delete(socket)
        if (connections.size === 0) {
          tenantConnections.delete(tenantId)
          // Unsubscribe from Redis channel -- no more clients for this tenant
          if (subscriber) {
            subscriber.unsubscribe(`ws:tenant:${tenantId}`)
          }
        }
      }
    }

    socket.on("close", cleanup)
    socket.on("error", (err) => {
      fastify.log.error({ err, tenantId }, "WebSocket error")
      cleanup()
    })
  })
}
