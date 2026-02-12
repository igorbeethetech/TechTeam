import fp from "fastify-plugin"
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"
import { auth } from "../auth.js"

// Type augmentation for Fastify request
declare module "fastify" {
  interface FastifyRequest {
    session: {
      session: {
        id: string
        userId: string
        expiresAt: Date
        token: string
        activeOrganizationId: string | null
      }
      user: {
        id: string
        name: string
        email: string
        emailVerified: boolean
        image: string | null
        createdAt: Date
        updatedAt: Date
      }
    } | null
    user: {
      id: string
      name: string
      email: string
      emailVerified: boolean
      image: string | null
      createdAt: Date
      updatedAt: Date
    } | null
  }
}

async function authPlugin(fastify: FastifyInstance) {
  fastify.decorateRequest("session", null)
  fastify.decorateRequest("user", null)

  fastify.addHook("preHandler", async (request: FastifyRequest, reply: FastifyReply) => {
    // Build headers from Fastify request
    const headers = new Headers()
    for (const [key, value] of Object.entries(request.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value)
    }

    const sessionData = await auth.api.getSession({
      headers,
    })

    if (!sessionData) {
      return reply.status(401).send({ error: "Not authenticated" })
    }

    request.session = sessionData as FastifyRequest["session"]
    request.user = sessionData.user as FastifyRequest["user"]
  })
}

export default fp(authPlugin, {
  name: "auth-plugin",
})
