import { prisma } from "./client.js"

// Models that require tenant filtering
// User is managed by Better Auth separately
const TENANT_MODELS = ["Project", "Demand", "AgentRun"] as const

export function forTenant(tenantId: string) {
  return prisma.$extends({
    name: "tenantIsolation",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: {
          model: string
          operation: string
          args: any
          query: (args: any) => Promise<any>
        }) {
          // Only filter models that have tenantId
          if (!TENANT_MODELS.includes(model as (typeof TENANT_MODELS)[number])) {
            return query(args)
          }

          // Inject tenantId into read operations
          if (
            operation === "findMany" ||
            operation === "findFirst" ||
            operation === "findUnique" ||
            operation === "count" ||
            operation === "aggregate"
          ) {
            args.where = { ...args.where, tenantId }
          }

          // Inject tenantId into create operations
          if (operation === "create") {
            args.data = { ...args.data, tenantId }
          }
          if (operation === "createMany") {
            if (Array.isArray(args.data)) {
              args.data = args.data.map((item: Record<string, unknown>) => ({
                ...item,
                tenantId,
              }))
            }
          }

          // Inject tenantId into update/delete operations
          if (
            operation === "update" ||
            operation === "updateMany" ||
            operation === "delete" ||
            operation === "deleteMany"
          ) {
            args.where = { ...args.where, tenantId }
          }

          return query(args)
        },
      },
    },
  })
}

// Type helper for the tenant-scoped client
export type TenantPrismaClient = ReturnType<typeof forTenant>
