import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"
import { spawn } from "node:child_process"
import { getClaudeCliStatus, validatePreflight } from "../lib/preflight.js"

export default async function settingsRoutes(fastify: FastifyInstance) {
  // GET / - Get tenant settings
  fastify.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const settings = await (request.prisma as any).tenantSettings.findFirst()

    return {
      settings: settings
        ? {
            githubToken: settings.githubToken ? "••••••••" + settings.githubToken.slice(-4) : null,
            anthropicApiKey: settings.anthropicApiKey ? "••••••••" + settings.anthropicApiKey.slice(-8) : null,
            hasGithubToken: !!settings.githubToken,
            hasAnthropicApiKey: !!settings.anthropicApiKey,
            agentExecutionMode: settings.agentExecutionMode ?? "sdk",
            beeLanguage: settings.beeLanguage ?? "pt-BR",
          }
        : {
            githubToken: null,
            anthropicApiKey: null,
            hasGithubToken: false,
            hasAnthropicApiKey: false,
            agentExecutionMode: "sdk",
            beeLanguage: "pt-BR",
          },
    }
  })

  // PUT / - Update tenant settings
  fastify.put("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      githubToken?: string | null
      anthropicApiKey?: string | null
      agentExecutionMode?: "sdk" | "cli"
      beeLanguage?: "pt-BR" | "en-US"
    }

    if (!body || (body.githubToken === undefined && body.anthropicApiKey === undefined && body.agentExecutionMode === undefined && body.beeLanguage === undefined)) {
      return reply.status(400).send({ error: "At least one setting is required" })
    }

    const data: Record<string, string | null> = {}
    if (body.githubToken !== undefined) data.githubToken = body.githubToken
    if (body.anthropicApiKey !== undefined) data.anthropicApiKey = body.anthropicApiKey
    if (body.agentExecutionMode !== undefined) data.agentExecutionMode = body.agentExecutionMode
    if (body.beeLanguage !== undefined) data.beeLanguage = body.beeLanguage

    const settings = await (request.prisma as any).tenantSettings.upsert({
      where: {
        tenantId: request.session!.session.activeOrganizationId!,
      },
      update: data,
      create: { ...data, tenantId: request.session!.session.activeOrganizationId! },
    })

    return {
      settings: {
        githubToken: settings.githubToken ? "••••••••" + settings.githubToken.slice(-4) : null,
        anthropicApiKey: settings.anthropicApiKey ? "••••••••" + settings.anthropicApiKey.slice(-8) : null,
        hasGithubToken: !!settings.githubToken,
        hasAnthropicApiKey: !!settings.anthropicApiKey,
        agentExecutionMode: settings.agentExecutionMode ?? "sdk",
        beeLanguage: settings.beeLanguage ?? "pt-BR",
      },
    }
  })

  // GET /claude-status - Check Claude CLI authentication status
  fastify.get("/claude-status", async (_request: FastifyRequest, _reply: FastifyReply) => {
    const status = await getClaudeCliStatus()
    return status
  })

  // POST /claude-login - Trigger Claude CLI login (opens browser on server)
  fastify.post("/claude-login", async (_request: FastifyRequest, _reply: FastifyReply) => {
    return new Promise((resolve) => {
      const child = spawn("claude", ["auth", "login"], {
        shell: true,
        detached: true,
        stdio: "ignore",
        env: { ...process.env, CLAUDECODE: undefined, ANTHROPIC_API_KEY: undefined },
      })

      child.unref()

      child.on("error", () => {
        resolve({ success: false, message: "Falha ao iniciar o processo de login do Claude CLI" })
      })

      // Don't wait for completion — the login is interactive (opens browser)
      // Frontend should poll /claude-status to detect when auth completes
      setTimeout(() => {
        resolve({ success: true, message: "Processo de login iniciado. Verifique seu navegador." })
      }, 500)
    })
  })

  // GET /preflight - Run pre-flight validation
  fastify.get("/preflight", async (request: FastifyRequest, _reply: FastifyReply) => {
    const tenantId = request.session!.session.activeOrganizationId!
    const result = await validatePreflight(tenantId)
    return result
  })
}
