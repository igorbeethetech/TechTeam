"use client"

import { use } from "react"
import { useQuery } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { api } from "@/lib/api"
import { DemandDetail } from "@/components/demands/demand-detail"
import { Button } from "@/components/ui/button"
import type { Demand } from "@techteam/shared"

interface DemandResponse {
  demand: Demand
}

export default function DemandDetailPage({
  params,
}: {
  params: Promise<{ demandId: string }>
}) {
  const { demandId } = use(params)

  const { data, isLoading, error } = useQuery({
    queryKey: ["demand", demandId],
    queryFn: () => api.get<DemandResponse>(`/api/demands/${demandId}`),
    staleTime: 0,
    refetchInterval: (query) => {
      const status = query.state.data?.demand?.agentStatus
      return status === "queued" || status === "running" ? 5000 : false
    },
  })

  const isAgentActive =
    data?.demand?.agentStatus === "queued" ||
    data?.demand?.agentStatus === "running"

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
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
