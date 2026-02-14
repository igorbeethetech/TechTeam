import { prisma } from "@techteam/database"
import {
  executeAgent,
  type AgentExecutionParams,
  type AgentExecutionResult,
} from "./base-agent.js"
import { executeAgentCli } from "./base-agent-cli.js"

/**
 * Agent execution router.
 * Dispatches to SDK or CLI executor based on tenant's agentExecutionMode setting.
 *
 * - "sdk" (default): Uses Anthropic SDK with API key (base-agent.ts)
 * - "cli": Uses Claude MAX CLI subprocess (base-agent-cli.ts)
 *
 * This is the single entry point agents should use in place of calling
 * executeAgent directly. In Plan 02, each agent will switch one import
 * from executeAgent to executeAgentAuto.
 */
export async function executeAgentAuto(
  tenantId: string,
  params: AgentExecutionParams
): Promise<AgentExecutionResult> {
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId },
  })

  const mode = settings?.agentExecutionMode ?? "sdk"

  if (mode === "cli") {
    return executeAgentCli(params)
  }

  return executeAgent(params)
}

export type { AgentExecutionParams, AgentExecutionResult } from "./base-agent.js"
