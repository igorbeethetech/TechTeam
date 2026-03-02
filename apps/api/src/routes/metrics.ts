import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"
import { prisma } from "@techteam/database"

export default async function metricsRoutes(fastify: FastifyInstance) {
  // GET /cost - METR-01: Cost per project (current month)
  fastify.get("/cost", async (request: FastifyRequest, reply: FastifyReply) => {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const costs = await request.prisma.demand.groupBy({
      by: ["projectId"],
      _sum: { totalCostUsd: true },
      _count: { id: true },
      where: {
        createdAt: { gte: startOfMonth },
      },
    })

    const projectIds = costs.map((c: any) => c.projectId)
    const projects = await request.prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, name: true },
    })

    const projectMap = new Map(projects.map((p: any) => [p.id, p.name]))

    return {
      costs: costs.map((c: any) => ({
        projectId: c.projectId,
        projectName: projectMap.get(c.projectId) ?? "Unknown",
        totalCostUsd: c._sum.totalCostUsd ?? 0,
        demandCount: c._count.id,
      })),
    }
  })

  // GET /throughput - METR-02: Demands completed per week (last 12 weeks)
  fastify.get("/throughput", async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.session!.session.activeOrganizationId!

    const result = await prisma.$queryRaw<
      { year: number; week: number; count: number }[]
    >`
      SELECT
        EXTRACT(ISOYEAR FROM "completedAt")::int AS year,
        EXTRACT(WEEK FROM "completedAt")::int AS week,
        COUNT(*)::int AS count
      FROM "Demand"
      WHERE "tenantId" = ${tenantId}
        AND "stage" = 'done'
        AND "completedAt" IS NOT NULL
        AND "completedAt" >= NOW() - INTERVAL '12 weeks'
      GROUP BY year, week
      ORDER BY year, week
    `

    return {
      throughput: result.map((r) => ({
        year: r.year,
        week: r.week,
        count: r.count,
        label: `W${r.week}`,
      })),
    }
  })

  // GET /avg-time-per-phase - METR-03: Average agent duration per phase
  fastify.get("/avg-time-per-phase", async (request: FastifyRequest, reply: FastifyReply) => {
    const stats = await request.prisma.agentRun.groupBy({
      by: ["phase"],
      _avg: { durationMs: true },
      _count: { id: true },
      where: {
        status: "completed",
      },
    })

    return {
      phases: stats.map((s: any) => ({
        phase: s.phase,
        avgDurationMs: Math.round(s._avg.durationMs ?? 0),
        totalRuns: s._count.id,
      })),
    }
  })

  // GET /dashboard - Dashboard summary stats in one call
  fastify.get("/dashboard", async (request: FastifyRequest, reply: FastifyReply) => {
    const now = new Date()
    const startOfWeek = new Date(now)
    startOfWeek.setDate(now.getDate() - now.getDay())
    startOfWeek.setHours(0, 0, 0, 0)

    // Run all counts in parallel
    const [
      activeDemands,
      awaitingReview,
      completedThisWeek,
      totalCost,
      recentDemands,
    ] = await Promise.all([
      // Active demands (not done)
      request.prisma.demand.count({
        where: { stage: { notIn: ["done"] } },
      }),
      // Awaiting review
      request.prisma.demand.count({
        where: { stage: { in: ["review", "merge"] } },
      }),
      // Completed this week
      request.prisma.demand.count({
        where: {
          stage: "done",
          updatedAt: { gte: startOfWeek },
        },
      }),
      // Total cost
      request.prisma.demand.aggregate({
        _sum: { totalCostUsd: true },
      }),
      // Recent activity: latest 10 demands with their latest stage
      request.prisma.demand.findMany({
        orderBy: { updatedAt: "desc" },
        take: 10,
        select: {
          id: true,
          title: true,
          stage: true,
          agentStatus: true,
          priority: true,
          updatedAt: true,
          projectId: true,
          project: { select: { name: true } },
        },
      }),
    ])

    return {
      stats: {
        activeDemands,
        awaitingReview,
        completedThisWeek,
        totalCostUsd: totalCost._sum.totalCostUsd ?? 0,
      },
      recentDemands,
    }
  })

  // GET /agent-success-rate - METR-04: Agent success rate
  fastify.get("/agent-success-rate", async (request: FastifyRequest, reply: FastifyReply) => {
    const stats = await request.prisma.agentRun.groupBy({
      by: ["status"],
      _count: { id: true },
    })

    const total = stats.reduce((sum: number, s: any) => sum + s._count.id, 0)
    const completed = stats.find((s: any) => s.status === "completed")?._count.id ?? 0
    const failed = stats.find((s: any) => s.status === "failed")?._count.id ?? 0

    return {
      total,
      completed,
      failed,
      successRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      byStatus: stats.map((s: any) => ({
        status: s.status,
        count: s._count.id,
      })),
    }
  })
}
