import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"
import { prisma } from "@techteam/database"
import { skillCreateSchema, skillUpdateSchema } from "@techteam/shared"

export default async function skillRoutes(fastify: FastifyInstance) {
  // GET / - List all skills (tenant + global defaults)
  fastify.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.session!.session.activeOrganizationId!

    // Raw prisma to include global defaults (tenantId=null) + tenant skills
    const skills = await prisma.skill.findMany({
      where: {
        OR: [{ tenantId }, { tenantId: null }],
      },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    })

    return { skills }
  })

  // POST / - Create a tenant skill
  fastify.post("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = skillCreateSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() })
    }

    const skill = await request.prisma.skill.create({
      data: {
        ...parsed.data,
        isDefault: false,
      } as any,
    })

    return reply.status(201).send({ skill })
  })

  // PUT /:id - Update a skill
  fastify.put("/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const parsed = skillUpdateSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() })
    }

    // Check if skill exists and user can edit it
    const tenantId = request.session!.session.activeOrganizationId!
    const existing = await prisma.skill.findUnique({ where: { id } })
    if (!existing) {
      return reply.status(404).send({ error: "Skill not found" })
    }

    // Can only edit tenant skills, not global defaults
    if (existing.tenantId === null) {
      return reply
        .status(403)
        .send({ error: "Cannot edit default skills. Create a custom skill instead." })
    }
    if (existing.tenantId !== tenantId) {
      return reply.status(403).send({ error: "Access denied" })
    }

    const skill = await prisma.skill.update({
      where: { id },
      data: parsed.data,
    })

    return { skill }
  })

  // PATCH /:id/toggle - Toggle skill enabled/disabled
  fastify.patch(
    "/:id/toggle",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string }
      const tenantId = request.session!.session.activeOrganizationId!

      const existing = await prisma.skill.findUnique({ where: { id } })
      if (!existing) {
        return reply.status(404).send({ error: "Skill not found" })
      }

      // Allow toggling both global and tenant skills
      if (existing.tenantId !== null && existing.tenantId !== tenantId) {
        return reply.status(403).send({ error: "Access denied" })
      }

      const skill = await prisma.skill.update({
        where: { id },
        data: { enabled: !existing.enabled },
      })

      return { skill }
    }
  )

  // DELETE /:id - Delete a tenant skill
  fastify.delete(
    "/:id",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string }
      const tenantId = request.session!.session.activeOrganizationId!

      const existing = await prisma.skill.findUnique({ where: { id } })
      if (!existing) {
        return reply.status(404).send({ error: "Skill not found" })
      }

      // Cannot delete global defaults
      if (existing.tenantId === null) {
        return reply
          .status(403)
          .send({ error: "Cannot delete default skills. Disable it instead." })
      }
      if (existing.tenantId !== tenantId) {
        return reply.status(403).send({ error: "Access denied" })
      }

      await prisma.skill.delete({ where: { id } })

      return { success: true }
    }
  )
}
