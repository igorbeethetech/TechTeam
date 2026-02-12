import Fastify from "fastify"
import cors from "@fastify/cors"
import cookie from "@fastify/cookie"
import { config } from "./lib/config.js"

const app = Fastify({ logger: true })

// Register plugins
await app.register(cors, {
  origin: config.WEB_URL,
  credentials: true,
})

await app.register(cookie)

// Health check endpoint
app.get("/health", async () => {
  return { status: "ok", timestamp: new Date().toISOString() }
})

// Start server
const port = config.API_PORT
await app.listen({ port, host: "0.0.0.0" })
console.log(`API running on http://localhost:${port}`)
