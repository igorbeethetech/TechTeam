import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"
import { projectCreateSchema, projectUpdateSchema } from "@techteam/shared"

export default async function projectRoutes(fastify: FastifyInstance) {
  // GET /boards - List active projects with demand counts per stage
  fastify.get("/boards", async (request: FastifyRequest, reply: FastifyReply) => {
    const projects = await request.prisma.project.findMany({
      where: { status: "active" },
      orderBy: { createdAt: "desc" },
    })

    if (projects.length === 0) {
      return { projects: [] }
    }

    // Get demand counts grouped by projectId and stage in a single query
    const demandCounts = await request.prisma.demand.groupBy({
      by: ["projectId", "stage"],
      _count: { id: true },
      where: {
        projectId: { in: projects.map((p) => p.id) },
      },
    })

    // Build response: each project gets a demandCounts object { stage: count }
    const projectBoards = projects.map((project) => ({
      id: project.id,
      name: project.name,
      repoUrl: project.repoUrl,
      createdAt: project.createdAt,
      demandCounts: Object.fromEntries(
        demandCounts
          .filter((dc) => dc.projectId === project.id)
          .map((dc) => [dc.stage, dc._count.id])
      ),
    }))

    return { projects: projectBoards }
  })

  // GET / - List active projects for the tenant
  fastify.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const projects = await request.prisma.project.findMany({
      where: { status: "active" },
      orderBy: { createdAt: "desc" },
    })
    return { projects }
  })

  // POST / - Create a new project
  fastify.post("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = projectCreateSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      })
    }

    // tenantId is automatically injected by the forTenant() extension
    const project = await request.prisma.project.create({
      data: parsed.data as any,
    })
    return reply.status(201).send({ project })
  })

  // GET /:id - Get a single project
  fastify.get("/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params
    const project = await request.prisma.project.findUnique({
      where: { id },
    })
    if (!project) {
      return reply.status(404).send({ error: "Project not found" })
    }
    return { project }
  })

  // PUT /:id - Update a project
  fastify.put("/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params
    const parsed = projectUpdateSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      })
    }

    try {
      const project = await request.prisma.project.update({
        where: { id },
        data: parsed.data,
      })
      return { project }
    } catch (error: unknown) {
      // Prisma throws P2025 when record not found
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code: string }).code === "P2025"
      ) {
        return reply.status(404).send({ error: "Project not found" })
      }
      throw error
    }
  })

  // PATCH /:id/archive - Archive a project
  fastify.patch("/:id/archive", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params
    try {
      const project = await request.prisma.project.update({
        where: { id },
        data: { status: "archived" },
      })
      return { project }
    } catch (error: unknown) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code: string }).code === "P2025"
      ) {
        return reply.status(404).send({ error: "Project not found" })
      }
      throw error
    }
  })

  // PATCH /:id/unarchive - Unarchive a project
  fastify.patch("/:id/unarchive", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params
    try {
      const project = await request.prisma.project.update({
        where: { id },
        data: { status: "active" },
      })
      return { project }
    } catch (error: unknown) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code: string }).code === "P2025"
      ) {
        return reply.status(404).send({ error: "Project not found" })
      }
      throw error
    }
  })
}
