import type { FastifyInstance } from "fastify"
import { auth } from "../auth.js"

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.all("/api/auth/*", async (request, reply) => {
    const url = new URL(
      request.url,
      `${request.protocol}://${request.hostname}`
    )

    const headers = new Headers()
    for (const [key, value] of Object.entries(request.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value)
    }

    const req = new Request(url.toString(), {
      method: request.method,
      headers,
      body: request.method !== "GET" && request.method !== "HEAD"
        ? JSON.stringify(request.body)
        : undefined,
    })

    const response = await auth.handler(req)

    // Forward ALL response headers from Better Auth (especially Set-Cookie)
    response.headers.forEach((value, key) => {
      reply.header(key, value)
    })

    const responseBody = await response.text()

    // Try to parse as JSON for cleaner response, fallback to text
    try {
      const json = JSON.parse(responseBody)
      return reply.status(response.status).send(json)
    } catch {
      return reply.status(response.status).send(responseBody)
    }
  })
}
