"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { CostByProject } from "@/components/metrics/cost-by-project"
import { DemandsPerWeekChart } from "@/components/metrics/demands-per-week-chart"
import { AvgTimePerPhase } from "@/components/metrics/avg-time-per-phase"
import { AgentSuccessRate } from "@/components/metrics/agent-success-rate"

interface CostResponse {
  costs: {
    projectId: string
    projectName: string
    totalCostUsd: number
    demandCount: number
  }[]
}

interface ThroughputResponse {
  throughput: {
    year: number
    week: number
    count: number
    label: string
  }[]
}

interface AvgTimeResponse {
  phases: {
    phase: string
    avgDurationMs: number
    totalRuns: number
  }[]
}

interface SuccessRateResponse {
  total: number
  completed: number
  failed: number
  successRate: number
  byStatus: { status: string; count: number }[]
}

export default function MetricsPage() {
  const costQuery = useQuery({
    queryKey: ["metrics", "cost"],
    queryFn: () => api.get<CostResponse>("/api/metrics/cost"),
  })

  const throughputQuery = useQuery({
    queryKey: ["metrics", "throughput"],
    queryFn: () => api.get<ThroughputResponse>("/api/metrics/throughput"),
  })

  const avgTimeQuery = useQuery({
    queryKey: ["metrics", "avg-time-per-phase"],
    queryFn: () => api.get<AvgTimeResponse>("/api/metrics/avg-time-per-phase"),
  })

  const successRateQuery = useQuery({
    queryKey: ["metrics", "agent-success-rate"],
    queryFn: () =>
      api.get<SuccessRateResponse>("/api/metrics/agent-success-rate"),
  })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Metrics</h2>
        <p className="mt-1 text-muted-foreground">
          Platform cost and performance overview
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <CostByProject
          data={costQuery.data?.costs}
          isLoading={costQuery.isLoading}
        />
        <AgentSuccessRate
          data={successRateQuery.data}
          isLoading={successRateQuery.isLoading}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <DemandsPerWeekChart
          data={throughputQuery.data?.throughput}
          isLoading={throughputQuery.isLoading}
        />
        <AvgTimePerPhase
          data={avgTimeQuery.data?.phases}
          isLoading={avgTimeQuery.isLoading}
        />
      </div>
    </div>
  )
}
