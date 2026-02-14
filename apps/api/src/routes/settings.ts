import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"

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
          }
        : {
            githubToken: null,
            anthropicApiKey: null,
            hasGithubToken: false,
            hasAnthropicApiKey: false,
          },
    }
  })

  // PUT / - Update tenant settings
  fastify.put("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      githubToken?: string | null
      anthropicApiKey?: string | null
    }

    if (!body || (body.githubToken === undefined && body.anthropicApiKey === undefined)) {
      return reply.status(400).send({ error: "At least one setting is required" })
    }

    const data: Record<string, string | null> = {}
    if (body.githubToken !== undefined) data.githubToken = body.githubToken
    if (body.anthropicApiKey !== undefined) data.anthropicApiKey = body.anthropicApiKey

    const settings = await (request.prisma as any).tenantSettings.upsert({
      where: {
        tenantId: request.session!.session.activeOrganizationId!,
      },
      update: data,
      create: data,
    })

    return {
      settings: {
        githubToken: settings.githubToken ? "••••••••" + settings.githubToken.slice(-4) : null,
        anthropicApiKey: settings.anthropicApiKey ? "••••••••" + settings.anthropicApiKey.slice(-8) : null,
        hasGithubToken: !!settings.githubToken,
        hasAnthropicApiKey: !!settings.anthropicApiKey,
      },
    }
  })
}
