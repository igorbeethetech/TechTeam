import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../generated/prisma/client.js"

// Load .env from monorepo root (CWD may be a subdirectory)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../../../.env") })

const connectionString = process.env.DATABASE_URL!

const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

export { prisma, PrismaClient }
export type { PrismaClient as PrismaClientType }
