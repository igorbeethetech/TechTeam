import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"
import { getGithubTokenForTenant, getGithubOrgs, listGithubRepos } from "../lib/github.js"

export default async function githubRoutes(fastify: FastifyInstance) {
  // GET /orgs - List GitHub organizations for the tenant's configured token
  fastify.get("/orgs", async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.session!.session.activeOrganizationId!

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

    try {
      const result = await getGithubOrgs(token)
      return {
        user: result.user,
        orgs: result.orgs,
      }
    } catch {
      return reply.status(502).send({
        error:
          "Failed to fetch GitHub organizations. Check your GitHub token permissions.",
      })
    }
  })

  // GET /repos?org=orgLogin - List GitHub repos for a given org/user
  fastify.get("/repos", async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.session!.session.activeOrganizationId!
    const { org: orgLogin } = request.query as { org?: string }

    if (!orgLogin) {
      return reply.status(400).send({ error: "Query parameter 'org' is required" })
    }

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

    try {
      const repos = await listGithubRepos(token, orgLogin)
      return { repos }
    } catch {
      return reply.status(502).send({
        error:
          "Failed to fetch GitHub repositories. Check your GitHub token permissions.",
      })
    }
  })
}
