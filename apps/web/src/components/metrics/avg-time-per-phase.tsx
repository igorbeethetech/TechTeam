"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

const chartConfig = {
  avgDurationMs: {
    label: "Avg Duration",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig

// Pipeline phase order for consistent display
const PHASE_ORDER = ["discovery", "planning", "development", "testing", "merge"]

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${remainingMinutes}m`
}

interface PhaseItem {
  phase: string
  avgDurationMs: number
  totalRuns: number
}

interface AvgTimePerPhaseProps {
  data: PhaseItem[] | undefined
  isLoading: boolean
}

export function AvgTimePerPhase({ data, isLoading }: AvgTimePerPhaseProps) {
  // Sort phases by pipeline order
  const sorted = data
    ? [...data].sort((a, b) => {
        const aIdx = PHASE_ORDER.indexOf(a.phase)
        const bIdx = PHASE_ORDER.indexOf(b.phase)
        return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx)
      })
    : []

  // Prepare chart data with formatted labels
  const chartData = sorted.map((item) => ({
    ...item,
    phaseLabel: item.phase.charAt(0).toUpperCase() + item.phase.slice(1),
    durationLabel: formatDuration(item.avgDurationMs),
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Average Time per Phase</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <div className="h-8 w-32 animate-pulse rounded bg-muted" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <p className="text-sm text-muted-foreground">
              No completed agent runs yet
            </p>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid horizontal={false} />
              <YAxis
                dataKey="phaseLabel"
                type="category"
                width={100}
                tickLine={false}
                axisLine={false}
              />
              <XAxis
                type="number"
                tickFormatter={(value: number) => formatDuration(value)}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) =>
                      formatDuration(value as number)
                    }
                  />
                }
              />
              <Bar
                dataKey="avgDurationMs"
                fill="var(--color-avgDurationMs)"
                radius={4}
              />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
