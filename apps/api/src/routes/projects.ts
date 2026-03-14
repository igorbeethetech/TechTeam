import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"
import { projectCreateSchema, projectUpdateSchema, projectInitSchema } from "@techteam/shared"
import { getGithubTokenForTenant, createGithubRepo } from "../lib/github.js"
import { ensureRepoReady, getRepoLocalPath, createGitClient } from "../lib/git.js"

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
        cancelledAt: null,
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

  // POST / - Create a new project (existing repo)
  fastify.post("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = projectCreateSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      })
    }

    const tenantId = request.session!.session.activeOrganizationId!
    const data = parsed.data

    // Compute deterministic local path
    const repoPath = getRepoLocalPath(tenantId, data.repoUrl)

    // Get GitHub token
    let token: string
    try {
      token = await getGithubTokenForTenant(tenantId)
    } catch (error) {
      return reply.status(400).send({
        error: error instanceof Error ? error.message : "GitHub token not configured",
      })
    }

    // Clone or update the repo
    try {
      await ensureRepoReady({ repoPath, repoUrl: data.repoUrl, defaultBranch: "main", token })
    } catch (error) {
      return reply.status(500).send({
        error: error instanceof Error ? error.message : "Failed to prepare repository",
      })
    }

    // Detect real default branch from the cloned repo
    let defaultBranch = "main"
    try {
      const git = createGitClient(repoPath)
      const remoteInfo = await git.remote(["show", "origin"])
      const match = remoteInfo?.match(/HEAD branch:\s*(\S+)/)
      if (match) {
        defaultBranch = match[1]
      }
    } catch {
      // Fall back to "main"
    }

    const project = await request.prisma.project.create({
      data: { ...data, repoPath, defaultBranch } as any,
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

    // 3. Compute local path and clone
    const repoPath = getRepoLocalPath(tenantId, repoResult.repoUrl)
    try {
      await ensureRepoReady({
        repoPath,
        repoUrl: repoResult.repoUrl,
        defaultBranch: repoResult.defaultBranch,
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

    // 4. Create Project record in database
    const project = await request.prisma.project.create({
      data: {
        name: data.name,
        description: data.description,
        repoUrl: repoResult.repoUrl,
        repoPath,
        defaultBranch: repoResult.defaultBranch,
        techStack: data.techStack,
        maxConcurrentDev: data.maxConcurrentDev,
        mergeStrategy: data.mergeStrategy,
        testInstructions: data.testInstructions,
        previewUrlTemplate: data.previewUrlTemplate,
        databaseUrl: data.databaseUrl,
      } as any,
    })

    return reply.status(201).send({ project })
  })

  // POST /:id/sync - Sync repository (fetch + pull)
  fastify.post("/:id/sync", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params
    console.log(`[sync] Syncing project ${id}`)
    const project = await request.prisma.project.findUnique({ where: { id } })
    if (!project) {
      return reply.status(404).send({ error: "Project not found" })
    }

    // Check for active agents
    const activeDemands = await request.prisma.demand.count({
      where: {
        projectId: id,
        agentStatus: { in: ["running", "queued"] },
        cancelledAt: null,
      },
    })
    if (activeDemands > 0) {
      return reply.status(409).send({
        error: "Cannot sync while agents are running. Wait for active agents to finish or cancel them.",
      })
    }

    const tenantId = request.session!.session.activeOrganizationId!
    let token: string
    try {
      token = await getGithubTokenForTenant(tenantId)
    } catch (error) {
      return reply.status(400).send({
        error: error instanceof Error ? error.message : "GitHub token not configured",
      })
    }

    try {
      console.log(`[sync] ensureRepoReady for repoPath=${project.repoPath}`)
      await ensureRepoReady({
        repoPath: project.repoPath,
        repoUrl: project.repoUrl,
        defaultBranch: project.defaultBranch,
        token,
      })
    } catch (error) {
      console.log(`[sync] ensureRepoReady failed:`, error instanceof Error ? error.message : error)
      // If the old path is a legacy manual path that's not a valid git repo,
      // migrate to the new auto-managed location
      const isLegacyError = error instanceof Error && error.message.includes("legacy project path")
      if (!isLegacyError) {
        return reply.status(500).send({
          error: error instanceof Error ? error.message : "Failed to sync repository",
        })
      }

      // Migrate: clone to new auto-managed path and update DB
      const newRepoPath = getRepoLocalPath(tenantId, project.repoUrl)
      try {
        await ensureRepoReady({
          repoPath: newRepoPath,
          repoUrl: project.repoUrl,
          defaultBranch: project.defaultBranch,
          token,
        })
        await request.prisma.project.update({
          where: { id },
          data: { repoPath: newRepoPath },
        })
      } catch (migrationError) {
        return reply.status(500).send({
          error: migrationError instanceof Error ? migrationError.message : "Failed to migrate repository",
        })
      }
    }

    return { success: true }
  })

  // GET /:id/branches - List remote branches for a project
  fastify.get("/:id/branches", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params
    const project = await request.prisma.project.findUnique({ where: { id } })
    if (!project) {
      return reply.status(404).send({ error: "Project not found" })
    }

    const tenantId = request.session!.session.activeOrganizationId!
    let token: string
    try {
      token = await getGithubTokenForTenant(tenantId)
    } catch (error) {
      return reply.status(400).send({
        error: error instanceof Error ? error.message : "GitHub token not configured",
      })
    }

    try {
      await ensureRepoReady({
        repoPath: project.repoPath,
        repoUrl: project.repoUrl,
        defaultBranch: project.defaultBranch,
        token,
      })
    } catch (error) {
      return reply.status(500).send({
        error: error instanceof Error ? error.message : "Failed to sync repository",
      })
    }

    try {
      const git = createGitClient(project.repoPath)
      const branchSummary = await git.branch(["-r"])
      const branches = Object.keys(branchSummary.branches)
        .map((b) => b.replace(/^origin\//, ""))
        .filter((b) => b !== "HEAD")

      return { branches, defaultBranch: project.defaultBranch }
    } catch (error) {
      return reply.status(500).send({
        error: error instanceof Error ? error.message : "Failed to list branches",
      })
    }
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
