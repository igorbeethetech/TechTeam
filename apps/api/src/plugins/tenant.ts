import fp from "fastify-plugin"
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"
import { forTenant, type TenantPrismaClient } from "@techteam/database"

// Extend FastifyRequest to include the tenant-scoped prisma client
declare module "fastify" {
  interface FastifyRequest {
    prisma: TenantPrismaClient
  }
}

async function tenantPlugin(fastify: FastifyInstance) {
  fastify.decorateRequest("prisma", null as unknown as TenantPrismaClient)

  fastify.addHook("preHandler", async (request: FastifyRequest, reply: FastifyReply) => {
    // session is attached by auth plugin (from Plan 02)
    const tenantId = request.session?.session?.activeOrganizationId
    if (!tenantId) {
      return reply.status(403).send({
        error: "No active organization. Please select or create an organization.",
      })
    }
    request.prisma = forTenant(tenantId)
  })
}

export default fp(tenantPlugin, {
  name: "tenant-plugin",
  dependencies: ["auth-plugin"],
})
