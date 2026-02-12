// Stub: Planning agent implementation
// Full implementation will be added in Plan 03-03

export interface PlanningAgentParams {
  demandId: string
  tenantId: string
  projectId: string
  timeout: number
}

/**
 * Runs the Planning phase agent.
 * Takes discovery output and produces a structured task
 * decomposition with file mappings and execution order.
 *
 * Stub implementation -- throws until Plan 03-03 completes.
 */
export async function runPlanningAgent(
  _params: PlanningAgentParams
): Promise<{ output: unknown; hasAmbiguities: boolean }> {
  throw new Error(
    "Planning agent not yet implemented. See Plan 03-03."
  )
}
