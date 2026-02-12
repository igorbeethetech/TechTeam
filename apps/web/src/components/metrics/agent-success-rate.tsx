"use client"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

interface AgentSuccessRateProps {
  data:
    | {
        total: number
        completed: number
        failed: number
        successRate: number
        byStatus: { status: string; count: number }[]
      }
    | undefined
  isLoading: boolean
}

export function AgentSuccessRate({ data, isLoading }: AgentSuccessRateProps) {
  const rateColor =
    data && data.successRate >= 80
      ? "text-green-600 dark:text-green-400"
      : data && data.successRate >= 50
        ? "text-yellow-600 dark:text-yellow-400"
        : "text-red-600 dark:text-red-400"

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Agent Success Rate</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <div className="h-12 w-24 animate-pulse rounded bg-muted" />
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          </div>
        ) : !data || data.total === 0 ? (
          <p className="text-sm text-muted-foreground">No agent runs yet</p>
        ) : (
          <div className="space-y-2">
            <div className={`text-4xl font-bold tabular-nums ${rateColor}`}>
              {data.successRate}%
            </div>
            <p className="text-sm text-muted-foreground">
              {data.completed} completed / {data.total} total runs
            </p>
            <p className="text-sm text-muted-foreground">
              {data.failed} failed
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
