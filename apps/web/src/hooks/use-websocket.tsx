"use client"

import {
  useEffect,
  useRef,
  useState,
  createContext,
  useContext,
  type ReactNode,
} from "react"
import { useQueryClient } from "@tanstack/react-query"

type ConnectionStatus = "connecting" | "connected" | "disconnected"

/**
 * Maps incoming WS event types to TanStack Query keys that should be invalidated.
 * Each handler receives the event payload and returns an array of query keys.
 */
const EVENT_TO_QUERY_KEYS: Record<string, (payload: any) => string[][]> = {
  "demand:updated": (p) => [["demand", p.demandId], ["demands", p.projectId]],
  "demand:stage-changed": (p) => [["demands", p.projectId]],
  "demand:cancelled": (p) => [
    ["demand", p.demandId],
    ["demands", p.projectId],
    ["agent-runs", p.demandId],
  ],
  "agent:status-changed": (p) => [
    ["demand", p.demandId],
    ["demands", p.projectId],
  ],
  "agent-run:updated": (p) => [["agent-runs", p.demandId]],
  "notification:created": () => [
    ["notifications", "unread-count"],
    ["notifications"],
  ],
  // BeeReqs events
  "sticky:created": (p) => [["stickies", p.reqsProjectId]],
  "sticky:updated": (p) => [["stickies", p.reqsProjectId]],
  "sticky:deleted": (p) => [["stickies", p.reqsProjectId]],
  "suggestion:created": (p) => [["ai-suggestions", p.meetingId]],
  "suggestion:updated": (p) => [["ai-suggestions", p.meetingId]],
  "meeting:updated": (p) => [["meeting", p.meetingId], ["meetings", p.reqsProjectId]],
  "transcript:chunk": (p) => [["transcript", p.meetingId]],
}

const WebSocketContext = createContext<ConnectionStatus>("disconnected")

/**
 * Returns the current WebSocket connection status.
 * Components use this to decide whether to poll or rely on WS events.
 */
export function useWsStatus(): ConnectionStatus {
  return useContext(WebSocketContext)
}

/**
 * App-wide WebSocket provider. Maintains a single WS connection,
 * maps incoming events to TanStack Query invalidations, and exposes
 * connection status via context.
 *
 * Must be rendered inside QueryClientProvider.
 */
export function WebSocketProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<ConnectionStatus>("disconnected")

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectDelayRef = useRef(1000)

  useEffect(() => {
    function connect() {
      // Build WS URL from API URL, replacing http(s) with ws(s)
      const apiUrl =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:3010"
      const wsUrl = `${apiUrl.replace(/^http/, "ws")}/ws`

      setStatus("connecting")

      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        setStatus("connected")
        reconnectDelayRef.current = 1000 // reset backoff on successful connection
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          const resolver = EVENT_TO_QUERY_KEYS[data.type]
          if (resolver) {
            const queryKeys = resolver(data.payload ?? data)
            for (const queryKey of queryKeys) {
              queryClient.invalidateQueries({ queryKey })
            }
          }
        } catch {
          // Malformed messages should not crash the app
        }
      }

      ws.onclose = () => {
        setStatus("disconnected")
        wsRef.current = null

        // Exponential backoff with jitter
        const jitter = Math.random() * 1000
        reconnectTimerRef.current = setTimeout(
          connect,
          reconnectDelayRef.current + jitter
        )
        reconnectDelayRef.current = Math.min(
          reconnectDelayRef.current * 2,
          30000
        )
      }

      ws.onerror = () => {
        // Let onclose handle reconnection (onerror always fires before onclose)
      }
    }

    connect()

    return () => {
      // Cleanup on unmount
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      if (wsRef.current) {
        wsRef.current.onclose = null // prevent reconnect on intentional close
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [queryClient])

  return (
    <WebSocketContext.Provider value={status}>
      {children}
    </WebSocketContext.Provider>
  )
}
