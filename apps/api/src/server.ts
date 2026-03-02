import Fastify from "fastify"
import cors from "@fastify/cors"
import cookie from "@fastify/cookie"
import { config } from "./lib/config.js"
import authRoutes from "./routes/auth.js"
import authPlugin from "./plugins/auth.js"
import tenantPlugin from "./plugins/tenant.js"
import websocketPlugin from "./plugins/websocket.js"
import projectRoutes from "./routes/projects.js"
import demandRoutes from "./routes/demands.js"
import agentRunRoutes from "./routes/agent-runs.js"
import mergeRoutes from "./routes/merge.js"
import metricsRoutes from "./routes/metrics.js"
import notificationRoutes from "./routes/notifications.js"
import settingsRoutes from "./routes/settings.js"
import wsRoutes from "./routes/ws.js"
import clientRoutes from "./routes/clients.js"
import reqsProjectRoutes from "./routes/reqs-projects.js"
import meetingRoutes from "./routes/meetings.js"
import stickyRoutes from "./routes/stickies.js"
import aiSuggestionRoutes from "./routes/ai-suggestions.js"
import beeAiRoutes from "./routes/bee-ai.js"
import skillRoutes from "./routes/skills.js"
import githubRoutes from "./routes/github.js"

const app = Fastify({ logger: true })

// Register plugins
await app.register(cors, {
  origin: config.WEB_URL,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
})

await app.register(cookie)

// WebSocket plugin (must be registered before WS routes)
await app.register(websocketPlugin)

// Health check endpoint
app.get("/health", async () => {
  return { status: "ok", timestamp: new Date().toISOString() }
})

// Auth routes (public -- Better Auth handles auth internally)
await app.register(authRoutes)

// Protected routes (require auth + tenant context)
await app.register(async (protectedApp) => {
  await protectedApp.register(authPlugin)   // validates session
  await protectedApp.register(tenantPlugin) // scopes prisma to tenant
  await protectedApp.register(projectRoutes, { prefix: "/api/projects" })
  await protectedApp.register(demandRoutes, { prefix: "/api/demands" })
  await protectedApp.register(agentRunRoutes, { prefix: "/api/agent-runs" })
  await protectedApp.register(mergeRoutes, { prefix: "/api" })
  await protectedApp.register(metricsRoutes, { prefix: "/api/metrics" })
  await protectedApp.register(notificationRoutes, { prefix: "/api/notifications" })
  await protectedApp.register(settingsRoutes, { prefix: "/api/settings" })
  // BeeReqs routes
  await protectedApp.register(clientRoutes, { prefix: "/api/clients" })
  await protectedApp.register(reqsProjectRoutes, { prefix: "/api/reqs-projects" })
  await protectedApp.register(meetingRoutes, { prefix: "/api/meetings" })
  await protectedApp.register(stickyRoutes, { prefix: "/api/stickies" })
  await protectedApp.register(aiSuggestionRoutes, { prefix: "/api/ai-suggestions" })
  await protectedApp.register(beeAiRoutes, { prefix: "/api/bee" })
  await protectedApp.register(skillRoutes, { prefix: "/api/skills" })
  await protectedApp.register(githubRoutes, { prefix: "/api/github" })
  await protectedApp.register(wsRoutes)
})

// Start server
const port = config.API_PORT
await app.listen({ port, host: "0.0.0.0" })
console.log(`API running on http://localhost:${port}`)
