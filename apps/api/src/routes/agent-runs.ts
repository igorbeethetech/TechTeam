import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"

export default async function agentRunRoutes(fastify: FastifyInstance) {
  // GET / - List agent runs for a demand
  fastify.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const { demandId } = request.query as { demandId?: string }

    if (!demandId) {
      return reply.status(400).send({
        error: "demandId query parameter is required",
      })
    }

    const agentRuns = await request.prisma.agentRun.findMany({
      where: { demandId },
      orderBy: { createdAt: "desc" },
    })

    return { agentRuns }
  })
}
