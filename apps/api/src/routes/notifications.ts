import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"

export default async function notificationRoutes(fastify: FastifyInstance) {
  // GET / - List notifications for current tenant (most recent 50)
  fastify.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const notifications = await (request.prisma as any).notification.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        demand: { select: { id: true, title: true } },
        project: { select: { id: true, name: true } },
      },
    })
    return { notifications }
  })

  // GET /unread-count - Count of unread notifications
  fastify.get(
    "/unread-count",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const count = await (request.prisma as any).notification.count({
        where: { read: false },
      })
      return { count }
    }
  )

  // PATCH /:id/read - Mark a single notification as read
  fastify.patch(
    "/:id/read",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params
      try {
        const notification = await (request.prisma as any).notification.update({
          where: { id },
          data: { read: true },
        })
        return { notification }
      } catch (error: unknown) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          (error as { code: string }).code === "P2025"
        ) {
          return reply.status(404).send({ error: "Notification not found" })
        }
        throw error
      }
    }
  )

  // POST /mark-all-read - Mark all unread notifications as read
  fastify.post(
    "/mark-all-read",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await (request.prisma as any).notification.updateMany({
        where: { read: false },
        data: { read: true },
      })
      return { updated: result.count }
    }
  )
}
