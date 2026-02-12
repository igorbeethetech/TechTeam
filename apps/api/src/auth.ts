import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { organization } from "better-auth/plugins"
import { prisma } from "@techteam/database"
import { config } from "./lib/config.js"

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  basePath: "/api/auth",
  emailAndPassword: {
    enabled: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // Refresh daily
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5-minute cookie cache
    },
  },
  trustedOrigins: [config.WEB_URL],
  plugins: [
    organization(),
  ],
})
