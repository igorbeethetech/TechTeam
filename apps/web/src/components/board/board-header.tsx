"use client"

import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface BoardHeaderProps {
  projectName: string
  projectId: string
  demandCount: number
  onNewDemand?: () => void
}

export function BoardHeader({
  projectName,
  demandCount,
  onNewDemand,
}: BoardHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">{projectName}</h1>
        <Badge variant="secondary">{demandCount} demands</Badge>
      </div>
      <Button onClick={onNewDemand}>
        <Plus className="size-4" />
        New Demand
      </Button>
    </div>
  )
}
