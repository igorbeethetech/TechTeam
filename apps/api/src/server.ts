import Fastify from "fastify"
import cors from "@fastify/cors"
import cookie from "@fastify/cookie"
import { config } from "./lib/config.js"
import authRoutes from "./routes/auth.js"
import authPlugin from "./plugins/auth.js"
import tenantPlugin from "./plugins/tenant.js"
import projectRoutes from "./routes/projects.js"

const app = Fastify({ logger: true })

// Register plugins
await app.register(cors, {
  origin: config.WEB_URL,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
})

await app.register(cookie)

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
})

// Start server
const port = config.API_PORT
await app.listen({ port, host: "0.0.0.0" })
console.log(`API running on http://localhost:${port}`)
