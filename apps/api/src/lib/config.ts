import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"

// Load .env from monorepo root
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") })

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue
}

const claudeModel = optionalEnv("CLAUDE_MODEL", "sonnet")

export const config = {
  DATABASE_URL: requireEnv("DATABASE_URL"),
  REDIS_URL: optionalEnv("REDIS_URL", "redis://localhost:6380"),
  BETTER_AUTH_SECRET: requireEnv("BETTER_AUTH_SECRET"),
  BETTER_AUTH_URL: optionalEnv("BETTER_AUTH_URL", "http://localhost:3001"),
  WEB_URL: optionalEnv("WEB_URL", "http://localhost:3000"),
  API_PORT: Number(optionalEnv("API_PORT", "3001")),
  ANTHROPIC_API_KEY: optionalEnv("ANTHROPIC_API_KEY", ""),
  CLAUDE_MODEL: claudeModel,
  CLAUDE_DEV_MODEL: optionalEnv("CLAUDE_DEV_MODEL", claudeModel),
  GITHUB_TOKEN: optionalEnv("GITHUB_TOKEN", ""),
} as const
