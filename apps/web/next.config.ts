import path from "node:path"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "standalone",
  // CRITICAL for monorepo: trace dependencies from monorepo root, not just apps/web
  // Without this, workspace packages like @techteam/shared won't be included in standalone output
  outputFileTracingRoot: path.join(import.meta.dirname, "../../"),
  transpilePackages: ["@techteam/shared"],
}

export default nextConfig
