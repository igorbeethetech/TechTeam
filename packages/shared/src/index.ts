export {
  projectCreateSchema,
  projectUpdateSchema,
  projectInitSchema,
  type ProjectCreate,
  type ProjectUpdate,
  type ProjectInit,
} from "./schemas/project"

export {
  demandCreateSchema,
  demandUpdateSchema,
  demandStageUpdateSchema,
  type DemandCreate,
  type DemandUpdate,
  type DemandStageUpdate,
} from "./schemas/demand"

export {
  type ProjectStatus,
  type MergeStrategy,
  type Project,
  type DemandStage,
  type DemandPriority,
  type Demand,
  type MergeStatus,
  type AgentStatus,
  type AgentRun,
  type Skill,
} from "./types/index"

export {
  discoveryOutputSchema,
  planningOutputSchema,
  developmentOutputSchema,
  testingOutputSchema,
  mergeResolverOutputSchema,
  type DiscoveryOutput,
  type PlanningOutput,
  type DevelopmentOutput,
  type TestingOutput,
  type MergeResolverOutput,
} from "./schemas/agent"

export {
  PROJECT_STATUS,
  MERGE_STRATEGY,
  PIPELINE_STAGES,
  type PipelineStage,
  PRIORITY_LEVELS,
  type PriorityLevel,
  STAGE_LABELS,
} from "./constants/index"

export {
  skillCreateSchema,
  skillUpdateSchema,
  SKILL_CATEGORIES,
  AGENT_PHASES,
  type SkillCategory,
  type AgentPhase,
  type SkillCreate,
  type SkillUpdate,
} from "./schemas/skill"

export { type WsEventType, type WsEvent } from "./types/ws-events"

// === BeeReqs exports ===

export {
  clientCreateSchema,
  clientUpdateSchema,
  type ClientCreate,
  type ClientUpdate,
} from "./schemas/client"

export {
  reqsProjectCreateSchema,
  reqsProjectUpdateSchema,
  type ReqsProjectCreate,
  type ReqsProjectUpdate,
} from "./schemas/reqs-project"

export {
  meetingCreateSchema,
  meetingUpdateSchema,
  type MeetingCreate,
  type MeetingUpdate,
} from "./schemas/meeting"

export {
  stickyCreateSchema,
  stickyUpdateSchema,
  type StickyCreate,
  type StickyUpdate,
} from "./schemas/sticky"

export {
  analyzeChunkRequestSchema,
  chunkAnalysisSchema,
  type AnalyzeChunkRequest,
  type ChunkAnalysis,
} from "./schemas/ai-analysis"

export {
  STICKY_CATEGORIES,
  STICKY_CATEGORY_CONFIG,
  CLIENT_SECTORS,
  SECTOR_LABELS,
  SUGGESTION_DIMENSIONS,
  DIMENSION_LABELS,
  type BeeStickyCategory,
  type BeeClientSector,
  type BeeSuggestionDimension,
  type BeeLanguage,
} from "./constants/bee"
