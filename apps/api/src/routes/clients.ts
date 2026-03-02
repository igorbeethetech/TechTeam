import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"
import { clientCreateSchema, clientUpdateSchema } from "@techteam/shared"

export default async function clientRoutes(fastify: FastifyInstance) {
  // GET / - List clients
  fastify.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const { status } = request.query as { status?: string }
    const where = status ? { status: status as any } : {}
    const clients = await request.prisma.client.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { reqsProjects: true } },
      },
    })
    return { clients }
  })

  // POST / - Create client
  fastify.post("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = clientCreateSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      })
    }

    const client = await request.prisma.client.create({
      data: {
        ...parsed.data,
        createdBy: request.session!.user.id,
      } as any,
    })
    return reply.status(201).send({ client })
  })

  // GET /:id - Get single client
  fastify.get("/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params
    const client = await request.prisma.client.findUnique({
      where: { id },
      include: {
        reqsProjects: {
          orderBy: { createdAt: "desc" },
        },
        _count: { select: { reqsProjects: true } },
      },
    })
    if (!client) {
      return reply.status(404).send({ error: "Client not found" })
    }
    return { client }
  })

  // PUT /:id - Update client
  fastify.put("/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params
    const parsed = clientUpdateSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      })
    }

    try {
      const client = await request.prisma.client.update({
        where: { id },
        data: parsed.data as any,
      })
      return { client }
    } catch (error: unknown) {
      if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "P2025") {
        return reply.status(404).send({ error: "Client not found" })
      }
      throw error
    }
  })

  // PATCH /:id/archive - Archive client
  fastify.patch("/:id/archive", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params
    try {
      const client = await request.prisma.client.update({
        where: { id },
        data: { status: "archived" },
      })
      return { client }
    } catch (error: unknown) {
      if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "P2025") {
        return reply.status(404).send({ error: "Client not found" })
      }
      throw error
    }
  })
}
