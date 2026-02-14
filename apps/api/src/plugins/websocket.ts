import fp from "fastify-plugin"
import type { FastifyInstance } from "fastify"
import websocket from "@fastify/websocket"

async function websocketPlugin(fastify: FastifyInstance) {
  await fastify.register(websocket)
}

export default fp(websocketPlugin, {
  name: "websocket-plugin",
})
