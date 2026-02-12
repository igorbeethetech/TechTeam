// Stub: Discovery agent implementation
// Full implementation will be added in Plan 03-02

export interface DiscoveryAgentParams {
  demandId: string
  tenantId: string
  projectId: string
  timeout: number
}

/**
 * Runs the Discovery phase agent.
 * Analyzes a demand and produces structured requirements,
 * complexity assessment, and identifies ambiguities.
 *
 * Stub implementation -- throws until Plan 03-02 completes.
 */
export async function runDiscoveryAgent(
  _params: DiscoveryAgentParams
): Promise<{ output: unknown; hasAmbiguities: boolean }> {
  throw new Error(
    "Discovery agent not yet implemented. See Plan 03-02."
  )
}
