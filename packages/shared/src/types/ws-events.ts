export type WsEventType =
  | "demand:updated"
  | "demand:stage-changed"
  | "demand:cancelled"
  | "agent:status-changed"
  | "agent-run:updated"
  | "notification:created"
  // BeeReqs events
  | "sticky:created"
  | "sticky:updated"
  | "sticky:deleted"
  | "suggestion:created"
  | "suggestion:updated"
  | "meeting:updated"
  | "transcript:chunk"

export interface WsEvent {
  type: WsEventType
  tenantId: string
  payload: {
    demandId?: string
    projectId?: string
    agentRunId?: string
    notificationId?: string
    // BeeReqs payloads
    stickyId?: string
    meetingId?: string
    suggestionId?: string
    reqsProjectId?: string
    chunkId?: string
  }
}
