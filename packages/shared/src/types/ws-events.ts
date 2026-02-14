export type WsEventType =
  | "demand:updated"
  | "demand:stage-changed"
  | "agent:status-changed"
  | "agent-run:updated"
  | "notification:created"

export interface WsEvent {
  type: WsEventType
  tenantId: string
  payload: {
    demandId?: string
    projectId?: string
    agentRunId?: string
    notificationId?: string
  }
}
