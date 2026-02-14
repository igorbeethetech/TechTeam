import { createAuthClient } from "better-auth/react"
import { organizationClient } from "better-auth/client/plugins"

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3010",
  plugins: [organizationClient()],
  fetchOptions: {
    credentials: "include" as RequestCredentials,
  },
})

export const { signIn, signUp, signOut, useSession, organization } = authClient
