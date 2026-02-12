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
  count: {
    label: "Demands",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig

interface ThroughputItem {
  year: number
  week: number
  count: number
  label: string
}

interface DemandsPerWeekChartProps {
  data: ThroughputItem[] | undefined
  isLoading: boolean
}

export function DemandsPerWeekChart({ data, isLoading }: DemandsPerWeekChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Demands Completed per Week</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <div className="h-8 w-32 animate-pulse rounded bg-muted" />
          </div>
        ) : !data || data.length === 0 ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <p className="text-sm text-muted-foreground">
              No completed demands yet
            </p>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
            <BarChart data={data}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" />
              <YAxis allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="var(--color-count)" radius={4} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
