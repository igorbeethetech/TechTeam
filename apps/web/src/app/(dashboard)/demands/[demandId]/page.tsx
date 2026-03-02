"use client"

import { use } from "react"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { api } from "@/lib/api"
import { useWsStatus } from "@/hooks/use-websocket"
import { DemandDetail } from "@/components/demands/demand-detail"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { Demand } from "@techteam/shared"

interface DemandResponse {
  demand: Demand
}

function DemandDetailSkeleton() {
  return (
    <div className="space-y-6">
      {/* Back button */}
      <Skeleton className="h-8 w-32" />

      {/* Title + badges */}
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <Skeleton className="h-8 flex-1" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-6 w-20" />
          </div>
        </div>
        <div className="flex gap-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>

      {/* Phase stepper */}
      <div className="flex items-center gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-1">
            {i > 0 && <Skeleton className="h-px w-10" />}
            <div className="flex flex-col items-center gap-1">
              <Skeleton className="size-5 rounded-full" />
              <Skeleton className="h-3 w-14" />
            </div>
          </div>
        ))}
      </div>

      {/* Quick info bar */}
      <Skeleton className="h-10 w-full" />

      {/* Tabs */}
      <div className="space-y-4">
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-24" />
          ))}
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  )
}

export default function DemandDetailPage({
  params,
}: {
  params: Promise<{ demandId: string }>
}) {
  const { demandId } = use(params)
  const wsStatus = useWsStatus()

  const { data, isLoading, error } = useQuery({
    queryKey: ["demand", demandId],
    queryFn: () => api.get<DemandResponse>(`/api/demands/${demandId}`),
    staleTime: 0,
    refetchInterval: wsStatus === "connected"
      ? false
      : (query) => {
          const status = query.state.data?.demand?.agentStatus
          return status === "queued" || status === "running" ? 5000 : false
        },
  })

  const isAgentActive =
    data?.demand?.agentStatus === "queued" ||
    data?.demand?.agentStatus === "running"

  if (isLoading) {
    return <DemandDetailSkeleton />
  }

  if (error || !data?.demand) {
    return (
      <div className="space-y-4 py-10 text-center">
        <p className="text-muted-foreground">Demand not found</p>
        <Button variant="outline" asChild>
          <Link href="/">
            <ArrowLeft className="size-4" />
            Back to Dashboard
          </Link>
        </Button>
      </div>
    )
  }

  return <DemandDetail demand={data.demand} isAgentActive={isAgentActive} />
}
