import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"
import { projectCreateSchema, projectUpdateSchema, projectInitSchema } from "@techteam/shared"
import { getGithubTokenForTenant, createGithubRepo } from "../lib/github.js"
import { cloneRepo, validateGitRepo } from "../lib/git.js"

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
    // Map legacy "merge" stage counts to "review"
    const projectBoards = projects.map((project) => {
      const counts: Record<string, number> = {}
      for (const dc of demandCounts.filter((dc) => dc.projectId === project.id)) {
        const stage = dc.stage === "merge" ? "review" : dc.stage
        counts[stage] = (counts[stage] ?? 0) + dc._count.id
      }
      return {
        id: project.id,
        name: project.name,
        repoUrl: project.repoUrl,
        createdAt: project.createdAt,
        demandCounts: counts,
      }
    })

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

  // POST /init - Create a new project from scratch (GitHub repo + clone + DB record)
  fastify.post("/init", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = projectInitSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      })
    }

    const tenantId = request.session!.session.activeOrganizationId!
    const data = parsed.data

    // 1. Get GitHub token
    let token: string
    try {
      token = await getGithubTokenForTenant(tenantId)
    } catch (error) {
      return reply.status(400).send({
        error:
          error instanceof Error
            ? error.message
            : "GitHub token not configured",
      })
    }

    // 2. Create repository on GitHub
    let repoResult: Awaited<ReturnType<typeof createGithubRepo>>
    try {
      repoResult = await createGithubRepo({
        token,
        orgLogin: data.orgLogin,
        repoName: data.repoName,
        description: data.description,
        isPrivate: data.visibility === "private",
      })
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { message?: string } }; message?: string }
      const message =
        apiError?.response?.data?.message ||
        apiError?.message ||
        "Failed to create GitHub repository"
      return reply.status(502).send({ error: `GitHub: ${message}` })
    }

    // 3. Clone to local path
    try {
      await cloneRepo({
        cloneUrl: repoResult.cloneUrl,
        localPath: data.localPath,
        token,
      })
    } catch (error) {
      return reply.status(500).send({
        error:
          error instanceof Error
            ? error.message
            : "Failed to clone repository",
        repoUrl: repoResult.repoUrl,
      })
    }

    // 4. Validate the cloned repo
    const isValid = await validateGitRepo(data.localPath)
    if (!isValid) {
      return reply.status(500).send({
        error:
          "Repository was cloned but could not be validated as a git repository",
        repoUrl: repoResult.repoUrl,
      })
    }

    // 5. Create Project record in database
    const project = await request.prisma.project.create({
      data: {
        name: data.name,
        description: data.description,
        repoUrl: repoResult.repoUrl,
        repoPath: data.localPath,
        defaultBranch: repoResult.defaultBranch,
        techStack: data.techStack,
        maxConcurrentDev: data.maxConcurrentDev,
        mergeStrategy: data.mergeStrategy,
        testInstructions: data.testInstructions,
        previewUrlTemplate: data.previewUrlTemplate,
      } as any,
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
