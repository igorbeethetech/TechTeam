"use client"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

interface CostItem {
  projectId: string
  projectName: string
  totalCostUsd: number
  demandCount: number
}

interface CostByProjectProps {
  data: CostItem[] | undefined
  isLoading: boolean
}

export function CostByProject({ data, isLoading }: CostByProjectProps) {
  const sorted = data ? [...data].sort((a, b) => b.totalCostUsd - a.totalCostUsd) : []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cost by Project (This Month)</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-6 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No costs recorded this month
          </p>
        ) : (
          <div className="space-y-3">
            {sorted.map((item) => (
              <div
                key={item.projectId}
                className="flex items-center justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {item.projectName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.demandCount} demand{item.demandCount !== 1 ? "s" : ""}
                  </p>
                </div>
                <span className="ml-4 text-sm font-mono font-medium tabular-nums">
                  ${item.totalCostUsd.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
