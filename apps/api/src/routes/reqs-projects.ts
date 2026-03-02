import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"
import { reqsProjectCreateSchema, reqsProjectUpdateSchema } from "@techteam/shared"

export default async function reqsProjectRoutes(fastify: FastifyInstance) {
  // GET / - List reqs projects (optionally filtered by clientId)
  fastify.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const { clientId } = request.query as { clientId?: string }
    const where = clientId ? { clientId } : {}
    const reqsProjects = await request.prisma.reqsProject.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        client: { select: { id: true, name: true, sector: true, color: true } },
        _count: { select: { meetings: true, stickies: true } },
      },
    })
    return { reqsProjects }
  })

  // POST / - Create reqs project
  fastify.post("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = reqsProjectCreateSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      })
    }

    const reqsProject = await request.prisma.reqsProject.create({
      data: {
        ...parsed.data,
        startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : undefined,
        deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : undefined,
        createdBy: request.session!.user.id,
      } as any,
    })
    return reply.status(201).send({ reqsProject })
  })

  // GET /:id - Get single reqs project
  fastify.get("/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params
    const reqsProject = await request.prisma.reqsProject.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true, sector: true, color: true } },
        meetings: { orderBy: { meetingNumber: "asc" } },
        _count: { select: { meetings: true, stickies: true } },
      },
    })
    if (!reqsProject) {
      return reply.status(404).send({ error: "Requirements project not found" })
    }
    return { reqsProject }
  })

  // PUT /:id - Update reqs project
  fastify.put("/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params
    const parsed = reqsProjectUpdateSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      })
    }

    try {
      const data: Record<string, unknown> = { ...parsed.data }
      if (parsed.data.startDate) data.startDate = new Date(parsed.data.startDate)
      if (parsed.data.deadline) data.deadline = new Date(parsed.data.deadline)

      const reqsProject = await request.prisma.reqsProject.update({
        where: { id },
        data: data as any,
      })
      return { reqsProject }
    } catch (error: unknown) {
      if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "P2025") {
        return reply.status(404).send({ error: "Requirements project not found" })
      }
      throw error
    }
  })
}
