export const PROJECT_STATUS = {
  ACTIVE: "active",
  ARCHIVED: "archived",
} as const

export const MERGE_STRATEGY = {
  FIFO: "fifo",
  PRIORITY: "priority",
} as const

export const PIPELINE_STAGES = [
  "inbox",
  "discovery",
  "planning",
  "development",
  "testing",
  "merge",
  "done",
] as const

export type PipelineStage = (typeof PIPELINE_STAGES)[number]
